import { supabase } from '../supabase/client';
import { shouldRefreshAuthProfile } from './authState';

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
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        callback(null, event);
        return;
      }

      // Token refreshes and tab-focus events must not rebuild the application.
      // The Supabase client already keeps the active session current.
      if (!shouldRefreshAuthProfile(event)) return;

      if (!session?.user) {
        if (event === 'INITIAL_SESSION') callback(null, event);
        return;
      }

      window.setTimeout(async () => {
        try {
          const currentUser = await loadProfile(session.user);
          if (currentUser && !currentUser.active) {
            await supabase.auth.signOut();
            callback(null, 'SIGNED_OUT');
            return;
          }
          callback(currentUser, event);
        } catch (error) {
          console.error('Erro ao carregar perfil autenticado:', error);
          // A transient profile/network failure must not discard an open form.
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
