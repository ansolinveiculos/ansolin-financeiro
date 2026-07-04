
import { calculateStats } from './src/lib/stats';
import { Proposal } from './src/types';

const testProposals: Proposal[] = [{
    id: '1',
    installments: [
        { id: 'i1', status: 'paid', value: 850, number: 1, dueDate: '2026-02-10' },
        { id: 'i2', status: 'paid', value: 850, number: 2, dueDate: '2026-03-10' },
        { id: 'i3', status: 'paid', value: 850, number: 3, dueDate: '2026-04-10' },
        { id: 'i4', status: 'paid', value: 850, number: 4, dueDate: '2026-05-10' },
        { id: 'i5', status: 'paid', value: 850, number: 5, dueDate: '2026-06-10' }
    ]
} as any];

const stats = calculateStats(testProposals);
console.log('Stats:', stats);
