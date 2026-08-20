import React from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { SignupForm } from '../components/SignupForm';

export const SignupPage: React.FC = () => {
  return (
    <AuthLayout 
      title="Create your organisation owner account" 
      subtitle="Establish your primary owner credentials and configure your organisation."
    >
      <SignupForm />
    </AuthLayout>
  );
};
