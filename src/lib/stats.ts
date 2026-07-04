import { Proposal, Installment } from '../types';

export const calculateStats = (proposals: Proposal[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return proposals.reduce((acc: any, curr: any) => {
        acc.totalVendido += (curr.carPrice || 0);
        acc.recebido += (curr.downPayment || 0);
        acc.count++;

        if (curr.installments) {
            curr.installments.forEach((inst: Installment) => {
                acc.totalInstallments++;
                const dueDate = new Date(inst.dueDate);
                dueDate.setHours(0, 0, 0, 0);

                if (inst.status === 'paid') {
                    acc.recebido += (inst.value || 0);
                    acc.paidInstallments++;
                } else {
                    if (dueDate < today) {
                        acc.overdue += (inst.value || 0);
                    } else {
                        acc.pendingFuture += (inst.value || 0);
                    }
                    acc.aReceber += (inst.value || 0);
                }
            });
        }
        return acc;
    }, { recebido: 0, aReceber: 0, overdue: 0, pendingFuture: 0, totalVendido: 0, count: 0, totalInstallments: 0, paidInstallments: 0 });
};
