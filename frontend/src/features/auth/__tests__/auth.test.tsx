import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, type UnknownAction } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import authReducer from '../authSlice';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { LoginForm } from '../components/LoginForm';
import { SignupForm } from '../components/SignupForm';

// Mock the API client
vi.mock('@/api/client', () => {
  return {
    loginUser: vi.fn(),
    signupUser: vi.fn(),
    logoutUser: vi.fn(),
    fetchCurrentUser: vi.fn(),
    requestPasswordReset: vi.fn(),
    confirmPasswordReset: vi.fn(),
    initializeCsrf: vi.fn(),
    ApiError: class ApiError extends Error {
      status: number;
      data: unknown;
      constructor(status: number, message: string, data: unknown) {
        super(message);
        this.status = status;
        this.data = data;
      }
    }
  };
});

// Helper component to observe current location in tests
const LocationTracker: React.FC = () => {
  const location = useLocation();
  return <div data-testid="location-path">{location.pathname}</div>;
};

const dummyUiReducer = (
  state = { selectedOrganizationId: '', selectedOutletId: '', sidebarExpanded: true },
  _action: UnknownAction
) => state;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createTestStore = (preloadedState?: any) => {
  return configureStore({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reducer: {
      auth: authReducer,
      ui: dummyUiReducer,
    } as any,
    preloadedState,
  });
};

describe('Authentication Flow & Security Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Redirects unauthenticated user trying to access protected routes to /login', () => {
    const store = createTestStore({
      auth: {
        currentUser: null,
        authenticationStatus: 'unauthenticated',
        authenticationError: null,
      }
    });

    console.log('Test 1 Preloaded Auth State:', store.getState().auth);

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/app/dashboard']}>
          <Routes>
            <Route 
              path="/app/dashboard" 
              element={
                <ProtectedRoute>
                  <div>Protected Dashboard Content</div>
                </ProtectedRoute>
              } 
            />
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    // Dashboard content should not be present
    expect(screen.queryByText('Protected Dashboard Content')).not.toBeInTheDocument();
    // User should be redirected to Login Page
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('2. Prevents protected-content flashing by showing a loading screen when authentication status is unknown/loading', () => {
    const store = createTestStore({
      auth: {
        currentUser: null,
        authenticationStatus: 'loading',
        authenticationError: null,
      }
    });

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/app/dashboard']}>
          <Routes>
            <Route 
              path="/app/dashboard" 
              element={
                <ProtectedRoute>
                  <div>Protected Dashboard Content</div>
                </ProtectedRoute>
              } 
            />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    // Dashboard content should not be present
    expect(screen.queryByText('Protected Dashboard Content')).not.toBeInTheDocument();
    // AuthLoadingScreen should be displayed
    expect(screen.getByText('Loading Pump ERP...')).toBeInTheDocument();
  });

  it('3. Validates empty email and password inputs locally in LoginForm', async () => {
    const store = createTestStore({
      auth: {
        currentUser: null,
        authenticationStatus: 'unauthenticated',
        authenticationError: null,
      }
    });

    render(
      <Provider store={store}>
        <MemoryRouter>
          <LoginForm />
        </MemoryRouter>
      </Provider>
    );

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitBtn);

    // Verify local validation error messages are displayed
    await waitFor(() => {
      expect(screen.getByText('Email address is required.')).toBeInTheDocument();
      expect(screen.getByText('Password is required.')).toBeInTheDocument();
    });
  });

  it('4. Validates signup form parameters locally', async () => {
    const store = createTestStore({
      auth: {
        currentUser: null,
        authenticationStatus: 'unauthenticated',
        authenticationError: null,
      }
    });

    render(
      <Provider store={store}>
        <MemoryRouter>
          <SignupForm />
        </MemoryRouter>
      </Provider>
    );

    const submitBtn = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitBtn);

    // Verify errors are raised for required empty fields
    await waitFor(() => {
      expect(screen.getByText('Full name is required.')).toBeInTheDocument();
      expect(screen.getByText('Work email is required.')).toBeInTheDocument();
      expect(screen.getByText('Organisation name is required.')).toBeInTheDocument();
      expect(screen.getByText('Organisation code is required.')).toBeInTheDocument();
    });
  });

  it('5. Allows authenticated user to bypass redirect and access /app/dashboard', () => {
    const store = createTestStore({
      auth: {
        currentUser: {
          id: 'test-uuid',
          email: 'owner@example.com',
          display_name: 'Owner',
          phone_number: '',
          organisations: [
            { id: 'org-1', name: 'Org 1', code: 'ORG1', membership_type: 'owner', outlets: [] }
          ]
        },
        authenticationStatus: 'authenticated',
        authenticationError: null,
      }
    });

    console.log('Test 5 Preloaded Auth State:', store.getState().auth);

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/app/dashboard']}>
          <Routes>
            <Route 
              path="/app/dashboard" 
              element={
                <ProtectedRoute>
                  <div>Protected Dashboard Content</div>
                </ProtectedRoute>
              } 
            />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    // Dashboard content should be visible
    expect(screen.getByText('Protected Dashboard Content')).toBeInTheDocument();
  });

  it('6. Redirects an authenticated user from public auth pages like /login to /app/dashboard', () => {
    const store = createTestStore({
      auth: {
        currentUser: {
          id: 'test-uuid',
          email: 'owner@example.com',
          display_name: 'Owner',
          phone_number: '',
          organisations: []
        },
        authenticationStatus: 'authenticated',
        authenticationError: null,
      }
    });

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route 
              path="/login" 
              element={
                <ProtectedRoute requireAuth={false}>
                  <div>Login Form Content</div>
                </ProtectedRoute>
              } 
            />
            <Route path="/app/dashboard" element={<div>Dashboard Content</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    // User is already authenticated, so they should be redirected
    expect(screen.queryByText('Login Form Content')).not.toBeInTheDocument();
    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });

  it('7. Prevents open redirect attacks by rejecting absolute/external redirect URLs and falling back to /app/dashboard', () => {
    const store = createTestStore({
      auth: {
        currentUser: {
          id: 'test-uuid',
          email: 'owner@example.com',
          display_name: 'Owner',
          phone_number: '',
          organisations: []
        },
        authenticationStatus: 'authenticated',
        authenticationError: null,
      }
    });

    // Test a relative safe path vs unsafe open redirect locations
    const testCases = [
      { from: { pathname: '/app/sales' }, expected: '/app/sales' },
      { from: { pathname: 'https://evil.com/app/sales' }, expected: '/app/dashboard' },
      { from: { pathname: '//evil.com/app/sales' }, expected: '/app/dashboard' },
    ];

    testCases.forEach((tc) => {
      render(
        <Provider store={store}>
          <MemoryRouter 
            initialEntries={[{ pathname: '/login', state: { from: tc.from } }]}
          >
            <Routes>
              <Route 
                path="/login" 
                element={
                  <ProtectedRoute requireAuth={false}>
                    <div>Login Form Content</div>
                  </ProtectedRoute>
                } 
              />
              <Route path="/app/sales" element={<div>Sales Content</div>} />
              <Route path="/app/dashboard" element={<div>Dashboard Content</div>} />
              <Route path="*" element={<LocationTracker />} />
            </Routes>
          </MemoryRouter>
        </Provider>
      );

      // Verify redirection
      if (tc.expected === '/app/sales') {
        expect(screen.getByText('Sales Content')).toBeInTheDocument();
      } else {
        expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
      }

      // Cleanup DOM for next iteration
      cleanup();
    });
  });
});
