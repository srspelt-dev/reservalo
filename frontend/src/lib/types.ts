export type Role = "owner" | "staff" | "client";
export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed";
export type PaymentMethod = "cash" | "transfer";
export type PaymentStatus = "pending" | "paid";

export interface User {
  id: number;
  tenant_id: number;
  name: string;
  email: string;
  role: Role;
  resource_id: number | null;
  active: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface Tenant {
  id: number;
  name: string;
  slug: string;
  timezone: string;
  plan: string;
  active: boolean;
  created_at: string;
  description: string | null;
  logo_url: string | null;
  brand_color: string;
  whatsapp: string | null;
  location_url: string | null;
  photos: string[];
  promo_image_url: string | null;
  promo_title: string | null;
  accept_cash: boolean;
  accept_transfer: boolean;
  payment_alias: string | null;
  payment_instructions: string | null;
  deposit_percent: number;
  buffer_minutes: number;
  min_advance_minutes: number;
  max_advance_days: number;
  booking_mode: string;
  event_duration_minutes: number;
}

export interface Service {
  id: number;
  tenant_id: number;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: string;
  active: boolean;
  created_at: string;
  resource_ids: number[];
}

export interface Resource {
  id: number;
  tenant_id: number;
  name: string;
  description: string | null;
  active: boolean;
}

export interface Package {
  id: number;
  tenant_id: number;
  name: string;
  description: string | null;
  price: string;
  active: boolean;
  created_at: string;
}

export interface Schedule {
  id: number;
  resource_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface ScheduleException {
  id: number;
  resource_id: number;
  date: string;
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
}

export interface Booking {
  id: number;
  public_code: string;
  tenant_id: number;
  service_id: number;
  resource_id: number;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  start_datetime: string;
  end_datetime: string;
  notes: string | null;
  status: BookingStatus;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  payment_proof_url: string | null;
  packages: Package[];
  total_price: string;
  created_at: string;
}

export interface DashboardStats {
  bookings_today: number;
  bookings_week: number;
  bookings_week_prev: number;
  views_week: number;
  upcoming_bookings: number;
  total_clients: number;
  total_services: number;
  total_packages: number;
  total_resources: number;
  has_schedules: boolean;
  has_bookings: boolean;
  today: Booking[];
  upcoming: Booking[];
  week: { day: string; count: number }[];
  recent: Booking[];
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface PlanLimits {
  resources: number | null;
  services: number | null;
  bookings: number | null;
  users: number | null;
}

export interface Plan {
  code: string;
  name: string;
  price: number;
  limits: PlanLimits;
  features: { code: string; name: string }[];
}

export interface Subscription {
  plan: Plan;
  status: string;
  usage: { resources: number; services: number; bookings: number; users: number };
  limits: PlanLimits;
  features: string[];
}

export interface ReportOut {
  date_from: string;
  date_to: string;
  total_bookings: number;
  by_status: { pending: number; confirmed: number; cancelled: number; completed: number };
  cancellation_rate: number;
  revenue: number;
  revenue_paid: number;
  top_services: { name: string; count: number }[];
  by_day: { day: string; count: number }[];
}

export interface ClientSummary {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  total_bookings: number;
  last_visit: string | null;
}

export interface PublicTenant {
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  brand_color: string;
  whatsapp: string | null;
  location_url: string | null;
  photos: string[];
  promo_image_url: string | null;
  promo_title: string | null;
  accept_cash: boolean;
  accept_transfer: boolean;
  payment_alias: string | null;
  payment_instructions: string | null;
  deposit_percent: number;
  booking_mode: string;
  event_duration_minutes: number;
  weekly_hours: { day: number; ranges: string[] }[];
  is_open_now: boolean;
  closes_at: string | null;
  rating_avg: number | null;
  rating_count: number;
  reviews: { rating: number; comment: string | null; client_name: string; created_at: string }[];
  services: Service[];
  resources: Resource[];
  packages: Package[];
}

export interface PublicBookingDetail {
  public_code: string;
  status: BookingStatus;
  client_name: string;
  start_datetime: string;
  end_datetime: string;
  service_id: number;
  resource_id: number;
  service_name: string;
  resource_name: string;
  tenant_name: string;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  payment_proof_url: string | null;
  accept_transfer: boolean;
  payment_alias: string | null;
  can_manage: boolean;
  can_review: boolean;
  reviewed: boolean;
}
