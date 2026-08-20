import React from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { ResetPasswordForm } from '../components/ResetPasswordForm';

export const ResetPasswordPage: React.FC = () => {
  return (
    <AuthLayout 
      title="Create New Password" 
      subtitle="Please choose a strong password that you haven't used before."
    >
      <ResetPasswordForm />
    </AuthLayout>
  );
};
