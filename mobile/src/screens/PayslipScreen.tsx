import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { DollarSign, Calendar, ChevronRight, X, Info, AlertCircle, CheckCircle2 } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useNetworkStore } from '../store/useNetworkStore';

interface PayrollRecord {
  id: number;
  start_date: string;
  end_date: string;
  base_salary: number;
  total_additions: number;
  total_deductions: number;
  net_salary: number;
  status: 'draft' | 'finalized' | 'paid';
}

interface PayrollTransaction {
  id: number;
  type: string;
  amount: number;
  status: string;
  manager_notes: string | null;
  created_at: string;
}

export default function PayslipScreen() {
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState<PayrollRecord | null>(null);
  const [transactions, setTransactions] = useState<PayrollTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const { isConnected } = useNetworkStore();

  const fetchPayrolls = useCallback(async () => {
    if (!isConnected) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const response = await api.get('/payroll/my-records');
      setPayrolls(response.data);
    } catch (error: any) {
      if (!error.isNetworkError) {
        console.error('Error fetching payrolls:', error);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isConnected]);

  useFocusEffect(
    useCallback(() => {
      fetchPayrolls();
    }, [fetchPayrolls])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchPayrolls();
  };

  const fetchTransactions = async (payrollId: number) => {
    if (!isConnected) return;
    setLoadingTransactions(true);
    try {
      const response = await api.get(`/payroll/my-records/${payrollId}/transactions`);
      setTransactions(response.data);
    } catch (error: any) {
      if (!error.isNetworkError) {
        console.error('Error fetching transactions:', error);
      }
    } finally {
      setLoadingTransactions(false);
    }
  };

  const handleOpenDetails = (payroll: PayrollRecord) => {
    setSelectedPayroll(payroll);
    setTransactions([]);
    setModalVisible(true);
    fetchTransactions(payroll.id);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], { month: 'short', year: 'numeric' });
  };

  const formatFullDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderPayrollItem = ({ item }: { item: PayrollRecord }) => (
    <TouchableOpacity style={styles.card} onPress={() => handleOpenDetails(item)}>
      <View style={styles.cardHeader}>
        <View style={styles.dateContainer}>
          <Calendar size={18} color="#71717a" />
          <Text style={styles.dateText}>{formatDate(item.start_date)}</Text>
        </View>
        <View style={[styles.statusBadge, 
          item.status === 'paid' ? styles.paidBadge : 
          item.status === 'finalized' ? styles.finalizedBadge : 
          styles.draftBadge
        ]}>
          <Text style={[styles.statusText, 
            item.status === 'paid' ? styles.paidText : 
            item.status === 'finalized' ? styles.finalizedText : 
            styles.draftText
          ]}>
            {item.status.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Net Salary</Text>
          <Text style={styles.netAmount}>${item.net_salary.toFixed(2)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Base</Text>
            <Text style={styles.summaryValue}>${item.base_salary.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Additions</Text>
            <Text style={[styles.summaryValue, { color: '#10b981' }]}>+${item.total_additions.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Deductions</Text>
            <Text style={[styles.summaryValue, { color: '#ef4444' }]}>-${item.total_deductions.toFixed(2)}</Text>
          </View>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.footerText}>View detailed breakdown</Text>
        <ChevronRight size={16} color="#a1a1aa" />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Payslips</Text>
        <Text style={styles.subtitle}>View your earnings and deductions</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#18181b" />
        </View>
      ) : (
        <FlatList
          data={payrolls}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderPayrollItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#18181b" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <DollarSign size={48} color="#e4e4e7" style={{ marginBottom: 16 }} />
              <Text style={styles.emptyText}>No payroll records found yet.</Text>
            </View>
          }
        />
      )}

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Payslip Details</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedPayroll && `${formatFullDate(selectedPayroll.start_date)} - ${formatFullDate(selectedPayroll.end_date)}`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color="#18181b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedPayroll && (
                <View style={styles.mainSummary}>
                  <View style={styles.mainSummaryRow}>
                    <Text style={styles.mainSummaryLabel}>Base Salary</Text>
                    <Text style={styles.mainSummaryValue}>${selectedPayroll.base_salary.toFixed(2)}</Text>
                  </View>
                  <View style={styles.mainSummaryRow}>
                    <Text style={styles.mainSummaryLabel}>Total Additions</Text>
                    <Text style={[styles.mainSummaryValue, { color: '#10b981' }]}>+${selectedPayroll.total_additions.toFixed(2)}</Text>
                  </View>
                  <View style={styles.mainSummaryRow}>
                    <Text style={styles.mainSummaryLabel}>Total Deductions</Text>
                    <Text style={[styles.mainSummaryValue, { color: '#ef4444' }]}>-${selectedPayroll.total_deductions.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.divider, { marginVertical: 12 }]} />
                  <View style={styles.mainSummaryRow}>
                    <Text style={styles.netSalaryLabel}>Net Salary</Text>
                    <Text style={styles.netSalaryValue}>${selectedPayroll.net_salary.toFixed(2)}</Text>
                  </View>
                </View>
              )}

              <Text style={styles.sectionTitle}>Transaction History</Text>
              {loadingTransactions ? (
                <ActivityIndicator color="#18181b" style={{ marginTop: 20 }} />
              ) : transactions.length === 0 ? (
                <Text style={styles.emptyTransactions}>No specific additions or deductions for this period.</Text>
              ) : (
                transactions.map((tx) => (
                  <View key={tx.id} style={[styles.transactionCard, tx.status === 'rejected' && styles.rejectedTxCard]}>
                    <View style={styles.txHeader}>
                      <View style={styles.txTypeContainer}>
                        <Text style={styles.txType}>{tx.type.replace(/_/g, ' ').toUpperCase()}</Text>
                        {tx.status === 'rejected' ? (
                          <View style={styles.rejectedBadge}>
                            <AlertCircle size={10} color="#ef4444" />
                            <Text style={styles.rejectedBadgeText}>REJECTED</Text>
                          </View>
                        ) : (
                          <View style={styles.appliedBadge}>
                            <CheckCircle2 size={10} color="#10b981" />
                            <Text style={styles.appliedBadgeText}>APPLIED</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.txAmount, tx.type.includes('deduction') || tx.type.includes('unpaid') ? styles.negativeAmount : styles.positiveAmount]}>
                        {tx.status === 'rejected' ? '$0.00' : `${tx.type.includes('deduction') || tx.type.includes('unpaid') ? '-' : '+'}$${tx.amount.toFixed(2)}`}
                      </Text>
                    </View>
                    
                    {tx.manager_notes && (
                      <View style={styles.notesContainer}>
                        <Info size={14} color="#71717a" style={{ marginRight: 6 }} />
                        <Text style={styles.notesText}>{tx.manager_notes}</Text>
                      </View>
                    )}
                    
                    {tx.status === 'rejected' && !tx.manager_notes && (
                      <Text style={styles.noNotesText}>No explanation provided by manager.</Text>
                    )}
                  </View>
                ))
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f5', paddingTop: 60 },
  header: { paddingHorizontal: 20, marginBottom: 20 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#18181b', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#71717a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  dateContainer: { flexDirection: 'row', alignItems: 'center' },
  dateText: { fontSize: 16, fontWeight: '600', color: '#18181b', marginLeft: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: 'bold' },
  draftBadge: { backgroundColor: '#fef9c3' },
  draftText: { color: '#854d0e' },
  finalizedBadge: { backgroundColor: '#dcfce7' },
  finalizedText: { color: '#166534' },
  paidBadge: { backgroundColor: '#dbeafe' },
  paidText: { color: '#1e40af' },
  cardBody: { marginBottom: 12 },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 },
  amountLabel: { fontSize: 14, color: '#71717a' },
  netAmount: { fontSize: 24, fontWeight: 'bold', color: '#18181b' },
  divider: { height: 1, backgroundColor: '#f4f4f5' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  summaryItem: { flex: 1 },
  summaryLabel: { fontSize: 10, color: '#a1a1aa', textTransform: 'uppercase', marginBottom: 2 },
  summaryValue: { fontSize: 14, fontWeight: '600', color: '#3f3f46' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f4f4f5', paddingTop: 12 },
  footerText: { fontSize: 12, color: '#a1a1aa' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  emptyText: { fontSize: 16, color: '#a1a1aa' },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '85%', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#18181b' },
  modalSubtitle: { fontSize: 14, color: '#71717a', marginTop: 4 },
  modalBody: { flex: 1 },
  mainSummary: { backgroundColor: '#f8fafc', borderRadius: 16, padding: 16, marginBottom: 24 },
  mainSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  mainSummaryLabel: { fontSize: 14, color: '#64748b' },
  mainSummaryValue: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  netSalaryLabel: { fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
  netSalaryValue: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#18181b', marginBottom: 16 },
  emptyTransactions: { fontSize: 14, color: '#a1a1aa', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
  transactionCard: { backgroundColor: '#fff', borderLeftWidth: 4, borderLeftColor: '#10b981', padding: 12, borderRadius: 8, marginBottom: 12, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  rejectedTxCard: { borderLeftColor: '#ef4444', opacity: 0.8 },
  txHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  txTypeContainer: { flexDirection: 'row', alignItems: 'center' },
  txType: { fontSize: 12, fontWeight: 'bold', color: '#475569' },
  rejectedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fee2e2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
  rejectedBadgeText: { fontSize: 8, fontWeight: 'bold', color: '#b91c1c', marginLeft: 4 },
  appliedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
  appliedBadgeText: { fontSize: 8, fontWeight: 'bold', color: '#15803d', marginLeft: 4 },
  txAmount: { fontSize: 14, fontWeight: 'bold' },
  positiveAmount: { color: '#10b981' },
  negativeAmount: { color: '#ef4444' },
  notesContainer: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#f8fafc', padding: 8, borderRadius: 6 },
  notesText: { fontSize: 12, color: '#475569', flex: 1 },
  noNotesText: { fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }
});
