import users from '../config/users.json';
import md5 from 'md5';

const defaultUser = {
    username: 'admin',
    password: md5('admin'),
    accessLevel: 'admin'
};

export const authService = {
    login: (username, password) => {
        return new Promise((resolve, reject) => {
            let user = users.users.find(
                u => u.username === username && u.password === md5(password)
            );
            
            if (!user && username === defaultUser.username && md5(password) === defaultUser.password) {
                user = { ...defaultUser };
            }

            if (user) {
                const { password, ...userWithoutPassword } = user;
                localStorage.setItem('user', JSON.stringify(userWithoutPassword));
                resolve(userWithoutPassword);
            } else {
                resolve(null);
            }
        });
    },

    logout: () => {
        localStorage.removeItem('user');
    },

    getCurrentUser: () => {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },

    hasAccess: (requiredLevel) => {
        const user = authService.getCurrentUser();
        if (!user) return false;
        
        if (requiredLevel === 'admin') {
            return user.accessLevel === 'admin';
        }
        return true;
    }
};
