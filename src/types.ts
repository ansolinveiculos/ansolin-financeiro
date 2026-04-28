export enum ProposalStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
}

export interface Installment {
  id: string;
  number: number;
  dueDate: string;
  paidAt?: string | null;
  value: number;
  status: 'pending' | 'paid';
}

export interface Customer {
  id: string;
  name: string;
  cpf: string;
  email?: string;
  phone?: string;
  createdAt: Date;
}

export interface Proposal {
  id: string;
  customerId: string;
  customerName: string;
  customerCpf?: string;
  customerPhone?: string;
  carModel: string;
  carYear: number;
  carPrice: number;
  downPayment: number;
  installmentCount: number;
  installmentValue: number;
  interestRate: number;
  status: ProposalStatus;
  installments?: Installment[];
  firstDueDate?: string;
  notes?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}
