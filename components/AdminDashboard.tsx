import React, { useState } from 'react';
import { User, Transaction, Language, UserRole, InventoryItem, LocationData, LocationId } from '../types';
import { TRANSLATIONS } from '../constants';
import ConfirmationModal from './ConfirmationModal';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { exportDailyReportPDF, exportDailyReportExcel } from '../services/exportService';
import { 
    Users, 
    History, 
    Plus, 
    Trash2, 
    LogOut, 
    Shield, 
    ArrowRightLeft,
    ArrowDownCircle, 
    ArrowUpCircle,
    Clock,
    CheckCircle,
    XCircle,
    Package,
    Warehouse,
    Factory,
    Store,
    AlertTriangle,
    ExternalLink,
    FileSpreadsheet,
    FileText,
    Pencil,
    X,
    Save,
    Menu,
    Calendar
} from 'lucide-react';

interface AdminDashboardProps {
    users: User[];
    transactions: Transaction[];
    inventory: Record<string, InventoryItem[]>;
    onCreateUser: (user: Omit<User, 'id'>) => void;
    onEditUser: (user: User) => void;
    onDeleteUser: (id: string) => void;
    onDeleteItem: (locationId: string, itemId: string) => void;
    onLogout: () => void;
    language: Language;
    availableLocations: LocationData[];
    onManageLocation: (locationId: LocationId) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
    users, 
    transactions, 
    inventory,
    onCreateUser, 
    onEditUser,
    onDeleteUser, 
    onDeleteItem,
    onLogout, 
    language,
    availableLocations,
    onManageLocation
}) => {
    const [activeTab, setActiveTab] = useState<'users' | 'transactions' | 'inventory' | 'reports'>('users');
    const [selectedInventoryLocation, setSelectedInventoryLocation] = useState<string>('warehouse');
    const [showUserModal, setShowUserModal] = useState(false);
    
    // Reports State
    const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
    const [reportLocation, setReportLocation] = useState('mammal');
    const [reportFilter, setReportFilter] = useState<'all' | 'received' | 'used'>('all');

    const [confirmDelete, setConfirmDelete] = useState<{
        isOpen: boolean;
        type: 'user' | 'item';
        id: string;
        name: string;
        locationId?: string;
    }>({
        isOpen: false,
        type: 'user',
        id: '',
        name: ''
    });

    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [locationType, setLocationType] = useState<'central' | 'branch'>('central');
    const [userForm, setUserForm] = useState<{
        name: string;
        username: string;
        password: string;
        role: UserRole;
        branchCode?: string;
        branchName?: string;
    }>({
        name: '',
        username: '',
        password: '',
        role: 'warehouse_manager'
    });

    const t = TRANSLATIONS[language];
    const currentInventory = inventory[selectedInventoryLocation] || [];

    const openCreateModal = () => {
        setEditingUserId(null);
        setUserForm({ name: '', username: '', password: '', role: 'warehouse_manager', branchCode: '', branchName: '' });
        setLocationType('central');
        setShowUserModal(true);
    };

    const openEditModal = (user: User) => {
        setEditingUserId(user.id);
        setUserForm({ 
            name: user.name, 
            username: user.username, 
            password: '', 
            role: user.role, 
            branchCode: user.branchCode || '', 
            branchName: user.branchName || '' 
        });
        setLocationType(user.role === 'branch_manager' ? 'branch' : 'central');
        setShowUserModal(true);
    };

    const handleUserSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            ...userForm,
            role: locationType === 'branch' ? 'branch_manager' as UserRole : userForm.role
        };

        if (editingUserId) {
            onEditUser({ ...payload, id: editingUserId } as User);
        } else {
            onCreateUser(payload as any);
        }
        setShowUserModal(false);
    };

    const handleDeleteUserRequest = (user: User) => {
        setConfirmDelete({
            isOpen: true,
            type: 'user',
            id: user.id,
            name: user.name
        });
    };

    const handleDeleteItemRequest = (item: InventoryItem) => {
        const itemName = language === 'ar' ? item.nameAr : item.nameEn;
        setConfirmDelete({
            isOpen: true,
            type: 'item',
            id: item.id,
            name: itemName,
            locationId: selectedInventoryLocation
        });
    };

    const executeDeletion = () => {
        if (confirmDelete.type === 'user') {
            onDeleteUser(confirmDelete.id);
        } else if (confirmDelete.type === 'item' && confirmDelete.locationId) {
            onDeleteItem(confirmDelete.locationId, confirmDelete.id);
        }
    };

    const exportToExcel = () => {
        const data = currentInventory.map(item => ({
            'Item Name (EN)': item.nameEn,
            'Item Name (AR)': item.nameAr,
            'Category': item.category,
            'Quantity': item.quantity,
            'Unit': item.unit,
            'Last Updated': item.lastUpdated
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Inventory");
        XLSX.writeFile(wb, `Inventory_${selectedInventoryLocation}.xlsx`);
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.text(`Inventory Report - ${selectedInventoryLocation}`, 14, 15);
        autoTable(doc, {
            startY: 20,
            head: [['Name (EN)', 'Name (AR)', 'Category', 'Quantity', 'Unit', 'Last Updated']],
            body: currentInventory.map(item => [item.nameEn, item.nameAr, item.category, item.quantity, item.unit, item.lastUpdated]),
        });
        doc.save(`Inventory_${selectedInventoryLocation}.pdf`);
    };

    // Filter transactions for Reports tab (Base: Date & Location)
    const baseReports = transactions.filter(t => {
        const tDate = new Date(t.date).toISOString().split('T')[0];
        const isDateMatch = tDate === reportDate;
        const isLocationMatch = t.toLocation === reportLocation || (t.fromLocation === reportLocation && t.type === 'usage');
        const isTypeMatch = t.type === 'usage' || t.type === 'receive' || (t.type === 'transfer' && t.toLocation === reportLocation);
        return isDateMatch && isLocationMatch && isTypeMatch;
    });

    const totalReceived = baseReports.filter(t => t.type === 'receive' || t.type === 'transfer').length;
    const totalUsed = baseReports.filter(t => t.type === 'usage').length;

    // Filter for display based on user selection
    const filteredReports = baseReports.filter(t => {
        if (reportFilter === 'received') return t.type === 'receive' || t.type === 'transfer';
        if (reportFilter === 'used') return t.type === 'usage';
        return true;
    });

    return (
        <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col transition-colors ${language === 'ar' ? 'font-arabic' : ''}`}>
            {/* Header Mobile Only */}
            <div className="lg:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 sticky top-0 z-30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-brand-600 rounded-lg text-white">
                        <Shield className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-gray-900 dark:text-white">{t.adminDashboard}</span>
                </div>
                <button onClick={onLogout} className="p-2 text-red-500 rounded-lg">
                    <LogOut className="w-5 h-5 rtl:rotate-180" />
                </button>
            </div>

            <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
                {/* Desktop Sidebar & Mobile Top Nav */}
                <aside className="w-full lg:w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-row lg:flex-col overflow-x-auto lg:overflow-y-auto lg:z-20 scrollbar-hide">
                    <div className="hidden lg:block p-6 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-brand-600 rounded-lg text-white">
                                <Shield className="w-6 h-6" />
                            </div>
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t.adminDashboard}</h1>
                        </div>
                    </div>

                    <nav className="flex lg:flex-col p-2 lg:p-4 space-x-2 lg:space-x-0 lg:space-y-2 flex-grow">
                        {[
                            { id: 'users', label: t.users, icon: Users },
                            { id: 'inventory', label: t.inventory, icon: Package },
                            { id: 'reports', label: t.reports, icon: FileText },
                            { id: 'transactions', label: t.viewLogs, icon: History }
                        ].map(item => (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id as any)}
                                className={`flex-shrink-0 flex items-center gap-3 px-4 py-2.5 sm:py-3 rounded-xl transition-all whitespace-nowrap ${activeTab === item.id ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 font-bold' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                            >
                                <item.icon className="w-5 h-5" />
                                <span className="text-sm sm:text-base">{item.label}</span>
                            </button>
                        ))}
                    </nav>

                    <div className="hidden lg:block p-4 border-t border-gray-100 dark:border-gray-700">
                        <button 
                            onClick={onLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors font-medium"
                        >
                            <LogOut className="w-5 h-5 rtl:rotate-180" />
                            {t.logout}
                        </button>
                    </div>
                </aside>

                <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                    {activeTab === 'users' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                                <div>
                                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t.users}</h2>
                                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t.fullSystemAccess}</p>
                                </div>
                                <button
                                    onClick={openCreateModal}
                                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium transition-colors shadow-lg"
                                >
                                    <Plus className="w-5 h-5" />
                                    {t.createUser}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                                {users.map(user => (
                                    <div key={user.id} className="bg-white dark:bg-gray-800 rounded-2xl p-5 sm:p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-all hover:shadow-md">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="p-2.5 bg-gray-100 dark:bg-gray-700 rounded-xl">
                                                {user.role === 'admin' ? <Shield className="w-6 h-6 text-brand-600" /> : user.role === 'branch_manager' ? <Store className="w-6 h-6 text-blue-600" /> : <Warehouse className="w-6 h-6 text-orange-600" />}
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => openEditModal(user)} className="p-2 text-gray-400 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDeleteUserRequest(user)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1 truncate">{user.name}</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 truncate">@{user.username}</p>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${user.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : user.role === 'branch_manager' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'}`}>
                                                {t[user.role]}
                                            </span>
                                            {user.branchName && (
                                                <span className="text-xs text-gray-400 truncate">• {user.branchName}</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'inventory' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                             <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-8">
                                <div>
                                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t.inventory}</h2>
                                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t.selectLocationSub}</p>
                                </div>
                                <div className="flex gap-2 w-full xl:w-auto overflow-x-auto scrollbar-hide pb-2 sm:pb-0">
                                    <button onClick={exportToExcel} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 transition-colors text-xs sm:text-sm whitespace-nowrap">
                                        <FileSpreadsheet className="w-4 h-4" /> {t.exportExcel}
                                    </button>
                                    <button onClick={exportToPDF} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 transition-colors text-xs sm:text-sm whitespace-nowrap">
                                        <FileText className="w-4 h-4" /> {t.exportPDF}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm mb-8 overflow-hidden">
                                <div className="p-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700 flex flex-wrap gap-2 overflow-x-auto scrollbar-hide">
                                    {availableLocations.map(loc => (
                                        <button
                                            key={loc.id}
                                            onClick={() => setSelectedInventoryLocation(loc.id)}
                                            className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${selectedInventoryLocation === loc.id ? 'bg-brand-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100'}`}
                                        >
                                            {loc.id === 'warehouse' ? t.warehouse : loc.id === 'mammal' ? t.mammal : loc.name}
                                        </button>
                                    ))}
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left rtl:text-right text-xs sm:text-sm">
                                        <thead>
                                            <tr className="bg-gray-50/30 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-700">
                                                <th className="px-4 sm:px-6 py-3 sm:py-4 font-bold text-gray-400 uppercase tracking-tighter sm:tracking-normal">{t.itemName}</th>
                                                <th className="hidden sm:table-cell px-6 py-4 font-bold text-gray-400 uppercase">{t.category}</th>
                                                <th className="px-4 sm:px-6 py-3 sm:py-4 font-bold text-gray-400 uppercase">{t.stockLevel}</th>
                                                <th className="hidden md:table-cell px-6 py-4 font-bold text-gray-400 uppercase">{t.status}</th>
                                                <th className="px-4 sm:px-6 py-3 sm:py-4 font-bold text-gray-400 uppercase text-right rtl:text-left">{t.actions}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {currentInventory.map(item => (
                                                <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50">
                                                    <td className="px-4 sm:px-6 py-3 sm:py-4 font-medium text-gray-900 dark:text-white truncate max-w-[120px] sm:max-w-none">
                                                        {language === 'ar' ? item.nameAr : item.nameEn}
                                                        <div className="text-[9px] text-gray-400 font-normal mt-1 block sm:hidden">
                                                            {item.category}
                                                        </div>
                                                    </td>
                                                    <td className="hidden sm:table-cell px-6 py-4 text-gray-500">{item.category}</td>
                                                    <td className="px-4 sm:px-6 py-3 sm:py-4 font-bold">{item.quantity} <span className="text-[10px] font-medium text-gray-400">{item.unit}</span></td>
                                                    <td className="hidden md:table-cell px-6 py-4">
                                                        {item.quantity <= item.minThreshold ? (
                                                            <span className="text-red-600 flex items-center gap-1 text-xs font-bold"><AlertTriangle className="w-3 h-3" /> {t.lowStock}</span>
                                                        ) : (
                                                            <span className="text-green-600 text-xs font-bold">{t.inStock}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-right rtl:text-left">
                                                       <div className="flex items-center gap-1 justify-end">
                                                            <button 
                                                                onClick={() => onManageLocation(selectedInventoryLocation)}
                                                                className="text-brand-600 p-2 hover:bg-brand-50 rounded-lg transition-colors"
                                                            >
                                                                <ExternalLink className="w-4 h-4" />
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteItemRequest(item)}
                                                                className="text-red-400 p-2 hover:bg-red-50 rounded-lg transition-colors"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                       </div>
                                                    </td>
                                                </tr>
                                            ))}
                                            {currentInventory.length === 0 && (
                                                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">{t.noInventoryData}</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'reports' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                             <div className="flex flex-col xl:flex-row justify-between items-start gap-6 mb-8">
                                <div>
                                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t.dailyReports}</h2>
                                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t.dailySummary}</p>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                                    <div className="flex flex-col">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase px-2 mb-1">{t.selectDate}</label>
                                        <div className="relative">
                                            <input 
                                                type="date" 
                                                value={reportDate} 
                                                onChange={(e) => setReportDate(e.target.value)}
                                                className="pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-600 text-sm focus:ring-2 focus:ring-brand-500 outline-none w-full sm:w-auto text-gray-900 dark:text-white"
                                            />
                                            <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                                        </div>
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase px-2 mb-1">{t.location}</label>
                                        <select 
                                            value={reportLocation} 
                                            onChange={(e) => setReportLocation(e.target.value)}
                                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-600 text-sm focus:ring-2 focus:ring-brand-500 outline-none text-gray-900 dark:text-white"
                                        >
                                            {availableLocations.map(loc => (
                                                <option key={loc.id} value={loc.id}>{loc.id === 'warehouse' ? t.warehouse : loc.id === 'mammal' ? t.mammal : loc.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <button 
                                            onClick={() => exportDailyReportExcel(filteredReports, reportLocation, language, reportDate)}
                                            disabled={filteredReports.length === 0}
                                            className="p-2.5 bg-green-100 hover:bg-green-200 text-green-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            title={t.exportExcel}
                                        >
                                            <FileSpreadsheet className="w-5 h-5" />
                                        </button>
                                        <button 
                                            onClick={() => exportDailyReportPDF(filteredReports, reportLocation, language, undefined, reportDate)}
                                            disabled={filteredReports.length === 0}
                                            className="p-2.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            title={t.exportPDF}
                                        >
                                            <FileText className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <button 
                                    onClick={() => setReportFilter(prev => prev === 'received' ? 'all' : 'received')}
                                    className={`p-4 rounded-2xl shadow-sm border flex items-center gap-3 transition-all ${reportFilter === 'received' ? 'ring-2 ring-green-500 bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800' : 'bg-white dark:bg-gray-800 border-green-100 dark:border-green-900/30 hover:shadow-md'}`}
                                >
                                    <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-xl"><ArrowUpCircle className="w-5 h-5 text-green-600" /></div>
                                    <div className="text-left rtl:text-right">
                                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalReceived}</p>
                                        <p className="text-xs text-gray-500 uppercase font-bold">{t.totalReceived}</p>
                                    </div>
                                </button>
                                <button 
                                    onClick={() => setReportFilter(prev => prev === 'used' ? 'all' : 'used')}
                                    className={`p-4 rounded-2xl shadow-sm border flex items-center gap-3 transition-all ${reportFilter === 'used' ? 'ring-2 ring-red-500 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800' : 'bg-white dark:bg-gray-800 border-red-100 dark:border-red-900/30 hover:shadow-md'}`}
                                >
                                    <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-xl"><ArrowDownCircle className="w-5 h-5 text-red-600" /></div>
                                    <div className="text-left rtl:text-right">
                                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalUsed}</p>
                                        <p className="text-xs text-gray-500 uppercase font-bold">{t.totalUsed}</p>
                                    </div>
                                </button>
                            </div>

                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                {filteredReports.length === 0 ? (
                                    <div className="p-12 text-center text-gray-400 italic">
                                        <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                        {t.noDataForDate}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left rtl:text-right text-sm">
                                            <thead>
                                                <tr className="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                                                    <th className="px-6 py-3 font-bold text-gray-400 uppercase">{t.type}</th>
                                                    <th className="px-6 py-3 font-bold text-gray-400 uppercase">{t.itemName}</th>
                                                    <th className="px-6 py-3 font-bold text-gray-400 uppercase">{t.quantity}</th>
                                                    <th className="px-6 py-3 font-bold text-gray-400 uppercase">{t.notes} / {t.from}</th>
                                                    <th className="px-6 py-3 font-bold text-gray-400 uppercase">{t.performedBy}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                                {filteredReports.map(tx => (
                                                    <tr key={tx.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50">
                                                        <td className="px-6 py-3">
                                                            {tx.type === 'usage' 
                                                                ? <span className="inline-flex items-center gap-1 text-red-600 font-bold text-xs bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded"><ArrowDownCircle className="w-3 h-3" /> {t.usage}</span> 
                                                                : <span className="inline-flex items-center gap-1 text-green-600 font-bold text-xs bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded"><ArrowUpCircle className="w-3 h-3" /> {t.receive}</span>
                                                            }
                                                        </td>
                                                        <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">{tx.itemName}</td>
                                                        <td className="px-6 py-3 font-mono text-gray-600 dark:text-gray-400">{tx.quantity} {tx.unit}</td>
                                                        <td className="px-6 py-3 text-gray-500 text-xs">
                                                            {tx.type === 'usage' ? tx.notes || '-' : `${t.from}: ${tx.fromLocation}`}
                                                        </td>
                                                        <td className="px-6 py-3 text-gray-500 text-xs">{tx.performedBy}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'transactions' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="mb-8">
                                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t.transactions}</h2>
                                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t.viewLogs}</p>
                            </div>

                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left rtl:text-right text-xs sm:text-sm">
                                        <thead>
                                            <tr className="bg-gray-50/30 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-700">
                                                <th className="px-4 sm:px-6 py-4 font-bold text-gray-400 uppercase whitespace-nowrap">{t.date}</th>
                                                <th className="px-4 sm:px-6 py-4 font-bold text-gray-400 uppercase">{t.type}</th>
                                                <th className="px-4 sm:px-6 py-4 font-bold text-gray-400 uppercase">{t.itemName}</th>
                                                <th className="hidden sm:table-cell px-6 py-4 font-bold text-gray-400 uppercase">{t.performedBy}</th>
                                                <th className="px-4 sm:px-6 py-4 font-bold text-gray-400 uppercase">{t.status}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {transactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(tx => (
                                                <tr key={tx.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50">
                                                    <td className="px-4 sm:px-6 py-4 text-gray-500 whitespace-nowrap">{new Date(tx.date).toLocaleDateString()}</td>
                                                    <td className="px-4 sm:px-6 py-4 uppercase font-bold text-[9px] sm:text-[10px]">
                                                        {tx.type === 'transfer' ? <span className="text-blue-600">{t.transfer}</span> : tx.type === 'usage' ? <span className="text-red-600">{t.usage}</span> : <span className="text-green-600">{t.receive}</span>}
                                                    </td>
                                                    <td className="px-4 sm:px-6 py-4 font-medium truncate max-w-[100px] sm:max-w-none">{tx.itemName}</td>
                                                    <td className="hidden sm:table-cell px-6 py-4 text-gray-500 truncate max-w-[120px]">{tx.performedBy}</td>
                                                    <td className="px-4 sm:px-6 py-4 font-bold">
                                                        <span className={tx.status === 'completed' ? 'text-green-600' : tx.status === 'rejected' ? 'text-red-600' : 'text-orange-600'}>{t[tx.status] || tx.status}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {transactions.length === 0 && (
                                                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">{t.noTransactionsFound}</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* User Modal - Touch Optimized */}
            {showUserModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{editingUserId ? t.editUser : t.createUser}</h2>
                            <button onClick={() => setShowUserModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleUserSubmit} className="space-y-4 sm:space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.fullName}</label>
                                <input required type="text" value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 text-sm" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.username}</label>
                                    <input required type="text" value={userForm.username} onChange={e => setUserForm({...userForm, username: e.target.value})} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.password}</label>
                                    <input required={!editingUserId} type="password" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 text-sm" placeholder={editingUserId ? t.leaveBlankKeep : ''} />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t.locationType}</label>
                                <div className="flex p-1 bg-gray-100 dark:bg-gray-900 rounded-xl">
                                    <button type="button" onClick={() => setLocationType('central')} className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${locationType === 'central' ? 'bg-white dark:bg-gray-700 text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{t.central}</button>
                                    <button type="button" onClick={() => setLocationType('branch')} className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${locationType === 'branch' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{t.branch}</button>
                                </div>
                            </div>

                            {locationType === 'central' ? (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.role}</label>
                                    <select value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value as UserRole})} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 text-sm">
                                        <option value="warehouse_manager">{t.warehouse_manager}</option>
                                        <option value="mammal_employee">{t.mammal_employee}</option>
                                        <option value="admin">{t.admin}</option>
                                    </select>
                                </div>
                            ) : (
                                <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800">
                                    <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase">{t.userAssignedBranch}</p>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.branchName}</label>
                                        <input required type="text" value={userForm.branchName} onChange={e => setUserForm({...userForm, branchName: e.target.value})} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.branchCode}</label>
                                        <input required type="text" value={userForm.branchCode} onChange={e => setUserForm({...userForm, branchCode: e.target.value})} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 text-sm" />
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3 pt-4 sticky bottom-0 bg-white dark:bg-gray-800">
                                <button type="button" onClick={() => setShowUserModal(false)} className="flex-1 py-3 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-medium transition-colors border border-gray-200 dark:border-gray-700 text-sm">{t.cancel}</button>
                                <button type="submit" className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2 text-sm"><Save className="w-4 h-4" /> {editingUserId ? t.updateUser : t.createUser}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ConfirmationModal
                isOpen={confirmDelete.isOpen}
                onClose={() => setConfirmDelete({...confirmDelete, isOpen: false})}
                onConfirm={executeDeletion}
                title={t.confirmDeleteTitle}
                message={`${confirmDelete.type === 'user' ? t.confirmDeleteUser : t.confirmDeleteItem}: "${confirmDelete.name}"?`}
                language={language}
                danger={true}
            />
        </div>
    );
};

export default AdminDashboard;