import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import authReducer from '@/features/auth/authSlice';

// Define the global UI context state shape
export interface UIState {
  selectedOrganizationId: string;
  selectedOutletId: string;
  sidebarExpanded: boolean;
}

const initialState: UIState = {
  selectedOrganizationId: '',
  selectedOutletId: '',
  sidebarExpanded: true,
};

// Create a UI slice
const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setOrganization: (state, action: PayloadAction<string>) => {
      state.selectedOrganizationId = action.payload;
    },
    setOutlet: (state, action: PayloadAction<string>) => {
      state.selectedOutletId = action.payload;
    },
    toggleSidebar: (state) => {
      state.sidebarExpanded = !state.sidebarExpanded;
    },
    setSidebarExpanded: (state, action: PayloadAction<boolean>) => {
      state.sidebarExpanded = action.payload;
    },
  },
});

export const { setOrganization, setOutlet, toggleSidebar, setSidebarExpanded } = uiSlice.actions;

export const uiReducer = uiSlice.reducer;

// Configure the store
export const store = configureStore({
  reducer: {
    ui: uiReducer,
    auth: authReducer,
  },
});

// Infer root state and dispatch types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Create custom typed hooks for use in components
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

