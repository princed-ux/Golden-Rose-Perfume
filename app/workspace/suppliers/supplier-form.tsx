'use client';
import type { ReactNode } from 'react';
import { ActionForm } from '@/src/components/action-feedback';
import { saveSupplierState } from '../operations/actions';
export function SupplierForm({children,className}:{children:ReactNode;className?:string}) { return <ActionForm action={saveSupplierState} className={className}>{children}</ActionForm>; }
