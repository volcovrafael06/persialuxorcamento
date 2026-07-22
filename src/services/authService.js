import { supabase } from '../supabase/client';

const mapUser = (user, profile = null) => {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    username: user.email,
    name: profile?.name || user.email,
    accessLevel: profile?.role || 'user',
    active: profile?.active === true
  };
};

const loadProfile = async (user) => {
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('name, role, active')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  return mapUser(user, data);
};

const getLoginError = error => {
  if (error?.code === 'invalid_credentials') {
    return new Error('E-mail ou senha inválidos.');
  }
  if (error?.code === 'email_not_confirmed') {
    return new Error('Confirme o e-mail antes de entrar.');
  }
  return error;
};

export const authService = {
  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) throw getLoginError(error);

    const currentUser = await loadProfile(data.user);
    if (!currentUser?.active) {
      await supabase.auth.signOut();
      throw new Error('Usuário desativado. Entre em contato com o administrador.');
    }

    return currentUser;
  },

  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getCurrentUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;

    const currentUser = await loadProfile(data.user);
    if (currentUser && !currentUser.active) {
      await supabase.auth.signOut();
      return null;
    }

    return currentUser;
  },

  onAuthStateChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(async () => {
        try {
          const currentUser = session?.user ? await loadProfile(session.user) : null;
          if (currentUser && !currentUser.active) {
            await supabase.auth.signOut();
            callback(null);
            return;
          }
          callback(currentUser);
        } catch (error) {
          console.error('Erro ao carregar perfil autenticado:', error);
          callback(null);
        }
      }, 0);
    });

    return data.subscription;
  },

  hasAccess(requiredLevel, user) {
    if (!user?.active) return false;
    return requiredLevel !== 'admin' || user.accessLevel === 'admin';
  }
};
