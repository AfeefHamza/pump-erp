import React from 'react';
import { Fuel } from 'lucide-react';

export const AuthLoadingScreen: React.FC = () => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-main)',
      color: 'var(--text-main)',
    }}>
      <div style={{
        animation: 'spin 2s linear infinite',
        marginBottom: '1rem',
      }}>
        <Fuel size={48} color="var(--color-primary)" />
      </div>
      <p style={{
        fontSize: '1rem',
        fontWeight: 500,
        color: 'var(--text-muted)',
      }}>Loading Pump ERP...</p>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
