import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EmployeeList from '../EmployeeList';
import api from '../../../lib/axios';

// Mock axios
jest.mock('../../../lib/axios');
const mockedApi = api as jest.Mocked<typeof api>;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const mockUsers = [
  {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    role: 'employee',
    status: 'active',
    job_id: 1,
    job_title: 'Software Engineer',
    is_clocked_in: 1,
  },
  {
    id: 2,
    name: 'Jane Smith',
    email: 'jane@example.com',
    role: 'pending',
    status: 'inactive',
    job_id: null,
    job_title: null,
    is_clocked_in: 0,
  }
];

const mockJobs = [
  { id: 1, title: 'Software Engineer' },
  { id: 2, title: 'Product Manager' }
];

describe('EmployeeList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.get.mockImplementation((url) => {
      if (url === '/users') return Promise.resolve({ data: mockUsers });
      if (url === '/jobs') return Promise.resolve({ data: mockJobs });
      if (url.startsWith('/users/')) return Promise.resolve({ data: mockUsers[0] });
      return Promise.reject(new Error('Not found'));
    });
  });

  it('renders employee list correctly', async () => {
    render(<EmployeeList />, { wrapper });

    expect(screen.getByText('Loading employees...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    expect(screen.getByText('Working')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('opens detail view when clicking an employee row', async () => {
    render(<EmployeeList />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('John Doe'));

    await waitFor(() => {
      // Check if detail view header is present
      expect(screen.getByText('Personal Information')).toBeInTheDocument();
      expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
    });
  });

  it('filters employees based on search term', async () => {
    render(<EmployeeList />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search employees...');
    fireEvent.change(searchInput, { target: { value: 'Jane' } });

    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });
});
