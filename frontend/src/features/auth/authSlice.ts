import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { 
  fetchCsrfToken, 
  fetchCurrentUser, 
  loginUser, 
  signupUser, 
  logoutUser, 
  type UserResponse, 
  ApiError 
} from '@/api/client';

export type AuthStatus = 'unknown' | 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  currentUser: UserResponse | null;
  authenticationStatus: AuthStatus;
  authenticationError: string | null;
}

const initialState: AuthState = {
  currentUser: null,
  authenticationStatus: 'unknown',
  authenticationError: null,
};

export const initializeAuth = createAsyncThunk(
  'auth/initializeAuth',
  async (_, { rejectWithValue }) => {
    try {
      // 1. Initialize CSRF
      await fetchCsrfToken();
      // 2. Fetch current user
      const user = await fetchCurrentUser();
      return user;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        return rejectWithValue('unauthenticated');
      }
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to initialize authentication');
    }
  }
);

export const login = createAsyncThunk(
  'auth/login',
  async (credentials: Record<string, unknown>, { rejectWithValue }) => {
    try {
      const user = await loginUser(credentials);
      return user;
    } catch (error) {
      if (error instanceof ApiError) {
        return rejectWithValue(error.data || { detail: error.message });
      }
      return rejectWithValue({ detail: error instanceof Error ? error.message : 'Login failed' });
    }
  }
);

export const signup = createAsyncThunk(
  'auth/signup',
  async (payload: Record<string, unknown>, { rejectWithValue }) => {
    try {
      const user = await signupUser(payload);
      return user;
    } catch (error) {
      if (error instanceof ApiError) {
        return rejectWithValue(error.data || { detail: error.message });
      }
      return rejectWithValue({ detail: error instanceof Error ? error.message : 'Signup failed' });
    }
  }
);

export const logout = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await logoutUser();
      return null;
    } catch (error) {
      if (error instanceof ApiError) {
        return rejectWithValue(error.data || { detail: error.message });
      }
      return rejectWithValue({ detail: error instanceof Error ? error.message : 'Logout failed' });
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuthError: (state) => {
      state.authenticationError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Initialize Auth
      .addCase(initializeAuth.pending, (state) => {
        state.authenticationStatus = 'unknown';
      })
      .addCase(initializeAuth.fulfilled, (state, action: PayloadAction<UserResponse>) => {
        state.currentUser = action.payload;
        state.authenticationStatus = 'authenticated';
        state.authenticationError = null;
      })
      .addCase(initializeAuth.rejected, (state, action) => {
        state.currentUser = null;
        state.authenticationStatus = 'unauthenticated';
        if (action.payload !== 'unauthenticated') {
          state.authenticationError = action.payload as string;
        }
      })
      // Login
      .addCase(login.pending, (state) => {
        state.authenticationStatus = 'loading';
        state.authenticationError = null;
      })
      .addCase(login.fulfilled, (state, action: PayloadAction<UserResponse>) => {
        state.currentUser = action.payload;
        state.authenticationStatus = 'authenticated';
        state.authenticationError = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.currentUser = null;
        state.authenticationStatus = 'unauthenticated';
        const errors = action.payload as { detail?: string; non_field_errors?: string[] } | undefined;
        state.authenticationError = errors?.detail || errors?.non_field_errors?.[0] || 'Login failed';
      })
      // Signup
      .addCase(signup.pending, (state) => {
        state.authenticationStatus = 'loading';
        state.authenticationError = null;
      })
      .addCase(signup.fulfilled, (state, action: PayloadAction<UserResponse>) => {
        state.currentUser = action.payload;
        state.authenticationStatus = 'authenticated';
        state.authenticationError = null;
      })
      .addCase(signup.rejected, (state, action) => {
        state.currentUser = null;
        state.authenticationStatus = 'unauthenticated';
        const errors = action.payload as { detail?: string; non_field_errors?: string[] } | undefined;
        state.authenticationError = errors?.detail || errors?.non_field_errors?.[0] || 'Signup failed';
      })
      // Logout
      .addCase(logout.pending, (state) => {
        state.authenticationStatus = 'loading';
      })
      .addCase(logout.fulfilled, (state) => {
        state.currentUser = null;
        state.authenticationStatus = 'unauthenticated';
        state.authenticationError = null;
      })
      .addCase(logout.rejected, (state) => {
        state.currentUser = null;
        state.authenticationStatus = 'unauthenticated';
      });
  },
});

export const { clearAuthError } = authSlice.actions;
export default authSlice.reducer;
