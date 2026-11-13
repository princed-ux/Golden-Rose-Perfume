import type { Metadata } from 'next';
import { CustomerAuthLayout } from '../customer-auth-layout';
import './page.css';

export const metadata: Metadata = {
  title: 'Join the Golden Rose World',
  description: 'Create your Golden Rose Perfume customer account.',
};

export default function RegisterPage() {
  return <CustomerAuthLayout mode="register" />;
}
