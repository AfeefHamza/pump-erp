import React from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { ForgotPasswordForm } from '../components/ForgotPasswordForm';

export const ForgotPasswordPage: React.FC = () => {
  return (
    <AuthLayout 
      title="Reset Your Password" 
      subtitle="Enter your email address and we'll send you a recovery link."
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
};
