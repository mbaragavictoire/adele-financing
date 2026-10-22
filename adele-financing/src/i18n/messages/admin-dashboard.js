// Strings for the admin Dashboard page (src/pages/admin/Dashboard.jsx).
// Table headers reuse the shared `ui.*` keys where they match exactly
// (Amount, Status, Date); quarter labels themselves come from the API and
// are interpolated as data, never translated.
export default {
  en: {
    'dashboard.quarterlyPerformance': 'Quarterly Performance',
    'dashboard.snapshot': 'Snapshot (to date)',

    'dashboard.totalCustomers': 'Total Customers',
    'dashboard.activeCustomers': 'Active Customers',
    'dashboard.inactiveCustomers': 'Inactive Customers',
    'dashboard.activeLoans': 'Active Loans',
    'dashboard.inactiveLoans': 'Inactive Loans',

    'dashboard.cardApplications': 'Applications · {quarter}',
    'dashboard.cardApproved': 'Approved · {quarter}',
    'dashboard.cardRejected': 'Rejected · {quarter}',
    'dashboard.cardLoansDisbursed': 'Loans Disbursed · {quarter}',
    'dashboard.cardDisbursedAmount': 'Disbursed Amount · {quarter}',
    'dashboard.cardRepaymentsReceived': 'Repayments Received · {quarter}',
    'dashboard.cardInterestReceived': 'Interest Received · {quarter}',
    'dashboard.cardCapitalRepaid': 'Capital Repaid · {quarter}',
    'dashboard.cardOutstanding': 'Outstanding · as of {date}',

    'dashboard.cardIncome': 'Income · {quarter}',
    'dashboard.cardExpenses': 'Expenses · {quarter}',
    'dashboard.cardNetProfit': 'Net Profit · {quarter}',
    'dashboard.cardCashBalance': 'Cash Balance · as of {date}',

    'dashboard.financialSummary': 'Financial Summary · {quarter}',
    'dashboard.recentApplications': 'Recent Loan Applications',
    'dashboard.recentRepayments': 'Recent Repayments',
    'dashboard.applicationsByStatus': 'Applications by Status · {quarter}',
    'dashboard.paymentActivity': 'Payment Activity · {quarter}',

    'dashboard.application': 'Application',
    'dashboard.customer': 'Customer',
    'dashboard.repayment': 'Repayment',
    'dashboard.noApplications': 'No applications yet.',
    'dashboard.noRepayments': 'No repayments yet.',
    'dashboard.noPaymentActivity': 'No payment activity yet.',
  },
  rw: {
    'dashboard.quarterlyPerformance': 'Imikorere y\'Igice cy\'Umwaka',
    'dashboard.snapshot': 'Imimerere y\'Ubu (kugeza ubu)',

    'dashboard.totalCustomers': 'Abakiriya Bose',
    'dashboard.activeCustomers': 'Abakiriya Bakora',
    'dashboard.inactiveCustomers': 'Abakiriya Bidakora',
    'dashboard.activeLoans': 'Inguzanyo Zikora',
    'dashboard.inactiveLoans': 'Inguzanyo Zidakora',

    'dashboard.cardApplications': 'Ubusabe · {quarter}',
    'dashboard.cardApproved': 'Byemewe · {quarter}',
    'dashboard.cardRejected': 'Byanzwe · {quarter}',
    'dashboard.cardLoansDisbursed': 'Inguzanyo zatanzwe · {quarter}',
    'dashboard.cardDisbursedAmount': 'Amafaranga yatanzwe · {quarter}',
    'dashboard.cardRepaymentsReceived': 'Kwishyura kwakiriwe · {quarter}',
    'dashboard.cardInterestReceived': 'Inyungu yakiriwe · {quarter}',
    'dashboard.cardCapitalRepaid': 'Umutungo wasubijwe · {quarter}',
    'dashboard.cardOutstanding': 'Ubwishyu busigaye · ku wa {date}',

    'dashboard.cardIncome': 'Amafaranga yinjiye · {quarter}',
    'dashboard.cardExpenses': 'Amafaranga yasohotse · {quarter}',
    'dashboard.cardNetProfit': 'Inyungu isigaye · {quarter}',
    'dashboard.cardCashBalance': 'Amafaranga ari mu bubiko · ku wa {date}',

    'dashboard.financialSummary': 'Isobanura ry\'Imari · {quarter}',
    'dashboard.recentApplications': 'Ubusabe bw\'Inguzanyo bwa vuba',
    'dashboard.recentRepayments': 'Kwishyura kwa vuba',
    'dashboard.applicationsByStatus': 'Ubusabe mu Miterere · {quarter}',
    'dashboard.paymentActivity': 'Ibikorwa by\'Ubwishyu · {quarter}',

    'dashboard.application': 'Ubusabe',
    'dashboard.customer': 'Umukiriya',
    'dashboard.repayment': 'Ubwishyu',
    'dashboard.noApplications': 'Nta busabe bwashyizweho.',
    'dashboard.noRepayments': 'Nta kwishyura kwakiriwe.',
    'dashboard.noPaymentActivity': 'Nta bikorwa by\'ubwishyu byageze.',
  },
  fr: {
    'dashboard.quarterlyPerformance': 'Performance trimestrielle',
    'dashboard.snapshot': "Aperçu (à ce jour)",

    'dashboard.totalCustomers': 'Total des clients',
    'dashboard.activeCustomers': 'Clients actifs',
    'dashboard.inactiveCustomers': 'Clients inactifs',
    'dashboard.activeLoans': 'Prêts actifs',
    'dashboard.inactiveLoans': 'Prêts inactifs',

    'dashboard.cardApplications': 'Demandes · {quarter}',
    'dashboard.cardApproved': 'Approuvées · {quarter}',
    'dashboard.cardRejected': 'Rejetées · {quarter}',
    'dashboard.cardLoansDisbursed': 'Prêts décaissés · {quarter}',
    'dashboard.cardDisbursedAmount': 'Montant décaissé · {quarter}',
    'dashboard.cardRepaymentsReceived': 'Remboursements reçus · {quarter}',
    'dashboard.cardInterestReceived': 'Intérêts reçus · {quarter}',
    'dashboard.cardCapitalRepaid': 'Capital remboursé · {quarter}',
    'dashboard.cardOutstanding': 'Encours · au {date}',

    'dashboard.cardIncome': 'Revenus · {quarter}',
    'dashboard.cardExpenses': 'Dépenses · {quarter}',
    'dashboard.cardNetProfit': 'Bénéfice net · {quarter}',
    'dashboard.cardCashBalance': 'Solde de caisse · au {date}',

    'dashboard.financialSummary': 'Résumé financier · {quarter}',
    'dashboard.recentApplications': 'Demandes de prêt récentes',
    'dashboard.recentRepayments': 'Remboursements récents',
    'dashboard.applicationsByStatus': 'Demandes par statut · {quarter}',
    'dashboard.paymentActivity': 'Activité des paiements · {quarter}',

    'dashboard.application': 'Demande',
    'dashboard.customer': 'Client',
    'dashboard.repayment': 'Remboursement',
    'dashboard.noApplications': 'Aucune demande pour le moment.',
    'dashboard.noRepayments': 'Aucun remboursement pour le moment.',
    'dashboard.noPaymentActivity': "Aucune activité de paiement pour le moment.",
  },
}
