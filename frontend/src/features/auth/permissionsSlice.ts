import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { fetchEffectivePermissions } from '@/api/client';

export interface PermissionsState {
  permissions: string[];
  loading: boolean;
  error: string | null;
}

const initialState: PermissionsState = {
  permissions: [],
  loading: false,
  error: null,
};

export const loadPermissions = createAsyncThunk(
  'permissions/loadPermissions',
  async (orgId: string, { rejectWithValue }) => {
    try {
      const response = await fetchEffectivePermissions(orgId);
      return response.permissions;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch permissions');
    }
  }
);

const permissionsSlice = createSlice({
  name: 'permissions',
  initialState,
  reducers: {
    clearPermissions: (state) => {
      state.permissions = [];
      state.loading = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadPermissions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadPermissions.fulfilled, (state, action: PayloadAction<string[]>) => {
        state.permissions = action.payload;
        state.loading = false;
        state.error = null;
      })
      .addCase(loadPermissions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string || 'Failed to fetch permissions';
      });
  },
});

export const { clearPermissions } = permissionsSlice.actions;
export default permissionsSlice.reducer;
