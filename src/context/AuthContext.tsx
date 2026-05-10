import React, { createContext, useContext, useState } from 'react';

export type AuthUser = {
  login: string;
  avatar_url: string;
  name: string;
  repos: string[];
};

interface AuthContextType {
  user: AuthUser | null;
  isLoggedIn: boolean;
  login: () => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('soyce_auth');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(false);

  const login = async () => {
    setIsLoading(true);
    // Simulate GitHub OAuth delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const mockUser: AuthUser = {
      login: "devuser42",
      avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4",
      name: "Dev User",
      repos: ["devuser42/my-app", "devuser42/cli-tool", "devuser42/open-sauce"]
    };
    
    setUser(mockUser);
    localStorage.setItem('soyce_auth', JSON.stringify(mockUser));
    setIsLoading(false);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('soyce_auth');
  };

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
