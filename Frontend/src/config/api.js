import { ENV } from './env';

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    SIGNUP: '/auth/signup',
    REFRESH: '/auth/refresh',
  },
  FOOD: {
    RESTAURANTS: '/sellers',
    ORDERS: '/food/orders',
    MENU: '/food/menu',
  },
  // Add other module endpoints here
};
