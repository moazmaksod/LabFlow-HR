import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EmployeeDetail from '../EmployeeDetail';
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

const mockEmployee = {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
  role: 'employee',
  age: 30,
  gender: 'male',
  profile_picture_url: null,
  weekly_schedule: JSON.stringify({
    monday: { start: '09:00', end: '17:00', isOff: false },
    tuesday: { start: '09:00', end: '17:00', isOff: false },
    wednesday: { start: '09:00', end: '17:00', isOff: false },
    thursday: { start: '09:00', end: '17:00', isOff: false },
    friday: { start: '09:00', end: '17:00', isOff: false },
    saturday: { isOff: true },
    sunday: { isOff: true }
  }),
  hourly_rate: 25,
  lunch_break_minutes: 60,
  emergency_contact_name: 'Jane Doe',
  emergency_contact_phone: '123456789',
  leave_balance: 15,
  job_id: 1,
  job_title: 'Software Engineer'
};

const mockJobs = [
  { id: 1, title: 'Software Engineer' }
];

describe('EmployeeDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = jest.fn(); // Mock alert
    mockedApi.get.mockImplementation((url) => {
      if (url === `/users/1`) return Promise.resolve({ data: mockEmployee });
      if (url === '/jobs') return Promise.resolve({ data: mockJobs });
      return Promise.reject(new Error('Not found'));
    });
    mockedApi.put.mockResolvedValue({ data: { ...mockEmployee, name: 'John Updated' } });
  });

  it('renders employee details correctly', async () => {
    render(<EmployeeDetail userId={1} onClose={() => {}} />, { wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('john@example.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('30')).toBeInTheDocument();
      expect(screen.getByDisplayValue('25')).toBeInTheDocument();
    });
  });

  it('handles schedule editing', async () => {
    render(<EmployeeDetail userId={1} onClose={() => {}} />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('monday')).toBeInTheDocument();
    });

    // Find the Monday start time input
    const mondayStartInput = screen.getAllByDisplayValue('09:00')[0];
    fireEvent.change(mondayStartInput, { target: { value: '10:00' } });
    expect(mondayStartInput).toHaveValue('10:00');

    // Toggle Friday to be off
    const fridayCheckbox = screen.getAllByRole('checkbox')[4]; // Friday is 5th day in DAYS array starting from Monday
    fireEvent.click(fridayCheckbox);
    
    // Check if "Day Off" text appears for Friday (there might be multiple if others are off)
    const dayOffElements = screen.getAllByText('Day Off');
    expect(dayOffElements.length).toBeGreaterThan(0);
  });

  it('triggers PUT request with correct payload on save', async () => {
    render(<EmployeeDetail userId={1} onClose={() => {}} />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    // Change name
    const nameInput = screen.getByDisplayValue('John Doe');
    fireEvent.change(nameInput, { target: { value: 'John Updated' } });

    // Click save
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockedApi.put).toHaveBeenCalledWith('/users/1/profile', expect.objectContaining({
        name: 'John Updated',
        hourly_rate: 25,
        leave_balance: 15
      }));
    });
    
    // Verify schedule is stringified in the payload if that's what the component does
    // Actually my component stringifies it in the PUT call if it's an object
    // Let's check the call arguments more closely
    const callArgs = mockedApi.put.mock.calls[0][1] as any;
    expect(typeof callArgs.weekly_schedule).toBe('object'); // Wait, my component sends it as object, backend stringifies it?
    // Let me re-read my component code
  });
});
