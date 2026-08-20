import React from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { LoginForm } from '../components/LoginForm';

export const LoginPage: React.FC = () => {
  return (
    <AuthLayout 
      title="Welcome to Pump ERP" 
      subtitle="Sign in to manage your daily fuel station operations."
    >
      <LoginForm />
    </AuthLayout>
  );
};
