import React, { useState, useRef, useEffect, useMemo } from 'react';
import { InventoryItem, LocationId, Language, Transaction, LocationData } from '../types';
import { LOCATIONS, TRANSLATIONS } from '../constants';
import SmartAssistant from './SmartAssistant';
import TransferModal from './TransferModal';
import AddItemModal from './AddItemModal';
import UsageModal from './UsageModal';
import { extractTextFromPDF, parseTransferDocument } from '../services/pdfService';
import { exportTransferPDF } from '../services/exportService';
import { 
  ArrowLeft, 
  Search, 
  Plus, 
  AlertTriangle, 
  Package, 
  Sparkles,
  Filter,
  MoreVertical,
  LogOut,
  ArrowRightLeft,
  Truck,
  CheckCircle,
  FileText,
  Loader2,
  Trash2,
  Pencil,
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronDown,
  Info,
  Globe,
  MapPin,
  Clock,
  XCircle,
  Bell,
  Eye,
  Undo,
  Download,
  ArrowUpDown,
  LayoutGrid,
  List as ListIcon,
  Grid3X3
} from 'lucide-react';

interface InventoryDashboardProps {
  locationId: LocationId;
  inventory: InventoryItem[];
  onBack: () => void;
  onLogout: () => void;
  language: Language;
  onTransfer: (items: { itemId: string, quantity: number }[], toLocation: LocationId, sourceOverride?: LocationId) => void;
  onAddItem: (locationId: string, item: Omit<InventoryItem, 'id' | 'lastUpdated'>) => void;
  onEditItem: (locationId: string, item: InventoryItem) => void;
  onDeleteItem: (locationId: string, itemId: string) => void;
  onRecordUsage: (itemId: string, quantity: number, notes: string) => void;
  userRole: string;
  incomingTransfers: Transaction[];
  outgoingTransfers: Transaction[];
  outgoingApprovals: Transaction[];
  onReceiveTransfer: (transaction: Transaction) => void;
  onRejectTransfer: (transaction: Transaction, reason: string) => void;
  onConfirmOutbound: (transaction: Transaction) => void;
  availableLocations: LocationData[];
}

const InventoryDashboard: React.FC<InventoryDashboardProps> = ({ 
  locationId, 
  inventory, 
  onBack, 
  onLogout, 
  language,
  onTransfer,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onRecordUsage,
  userRole,
  incomingTransfers,
  outgoingTransfers,
  outgoingApprovals,
  onReceiveTransfer,
  onRejectTransfer,
  onConfirmOutbound,
  availableLocations
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'inStock' | 'lowStock'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'quantity' | 'lastUpdated'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');

  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  
  const [itemToEdit, setItemToEdit] = useState<InventoryItem | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  
  const [isUsageModalOpen, setIsUsageModalOpen] = useState(false);
  const [usageItem, setUsageItem] = useState<InventoryItem | null>(null);

  // Grouped Notifications State
  const [selectedTransferGroup, setSelectedTransferGroup] = useState<string | null>(null);
  const [rejectionTarget, setRejectionTarget] = useState<Transaction | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [pdfTransferData, setPdfTransferData] = useState<{
      targetLocationId: string | null;
      items: { itemId: string; quantity: number }[];
  } | null>(null);

  useEffect(() => {
    const handleClickOutside = () => setActiveActionId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const isGlobalView = locationId === 'all';
  const t = TRANSLATIONS[language];
  const location = availableLocations.find(l => l.id === locationId) || (isGlobalView ? { id: 'all', name: t.globalInventory, icon: 'globe' } : { id: locationId, name: locationId });

  const categories = useMemo(() => {
    const cats = new Set(inventory.map(item => item.category));
    return Array.from(cats).sort();
  }, [inventory]);

  const filteredItems = useMemo(() => {
    const filtered = inventory.filter(item => {
      const searchLower = search.toLowerCase();
      const itemName = language === 'ar' ? item.nameAr : item.nameEn;
      const matchesSearch = 
        itemName.toLowerCase().includes(searchLower) || 
        item.category.toLowerCase().includes(searchLower) ||
        (item.description && item.description.toLowerCase().includes(searchLower)) ||
        (item.locationId && item.locationId.toLowerCase().includes(searchLower));
      
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const isLowStock = item.quantity <= item.minThreshold;
      const matchesStockStatus = stockStatusFilter === 'all' || (stockStatusFilter === 'lowStock' && isLowStock) || (stockStatusFilter === 'inStock' && !isLowStock);

      return matchesSearch && matchesCategory && matchesStockStatus;
    });

    return filtered.sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
            case 'name':
                const nameA = language === 'ar' ? a.nameAr : a.nameEn;
                const nameB = language === 'ar' ? b.nameAr : b.nameEn;
                comparison = nameA.localeCompare(nameB);
                break;
            case 'quantity':
                comparison = a.quantity - b.quantity;
                break;
            case 'lastUpdated':
                comparison = new Date(a.lastUpdated || 0).getTime() - new Date(b.lastUpdated || 0).getTime();
                break;
        }
        return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [inventory, search, selectedCategory, stockStatusFilter, language, sortBy, sortOrder]);

  const lowStockItems = inventory.filter(item => item.quantity <= item.minThreshold);
  const locationName = isGlobalView ? t.globalInventory : (location.id === 'warehouse' ? t.warehouse : location.id === 'mammal' ? t.mammal : (location as LocationData).name);

  const groupedIncoming = useMemo(() => {
      const groups: Record<string, Transaction[]> = {};
      incomingTransfers.forEach(tx => {
          const gid = tx.transferGroupId || `UNGROUPED-${tx.date}`;
          if (!groups[gid]) groups[gid] = [];
          groups[gid].push(tx);
      });
      return Object.entries(groups).sort((a,b) => new Date(b[1][0].date).getTime() - new Date(a[1][0].date).getTime());
  }, [incomingTransfers]);

  const groupedOutgoing = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    outgoingTransfers.forEach(tx => {
        const gid = tx.transferGroupId || `UNGROUPED-${tx.date}`;
        if (!groups[gid]) groups[gid] = [];
        groups[gid].push(tx);
    });
    return Object.entries(groups).sort((a,b) => new Date(b[1][0].date).getTime() - new Date(a[1][0].date).getTime());
}, [outgoingTransfers]);

  const handleReject = () => {
      if (rejectionTarget && rejectionReason.trim()) {
          onRejectTransfer(rejectionTarget, rejectionReason);
          setRejectionTarget(null);
          setRejectionReason('');
      }
  };

  const handleBulkAccept = (groupId: string) => {
      const group = groupedIncoming.find(g => g[0] === groupId);
      if (group) {
          group[1].forEach(tx => onReceiveTransfer(tx));
      }
  };

  const handleDownloadTransfer = (groupId: string, type: 'incoming' | 'outgoing') => {
    const group = (type === 'incoming' ? groupedIncoming : groupedOutgoing).find(g => g[0] === groupId);
    if (group) {
      exportTransferPDF(group[1], language);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessingPdf(true);
    try {
        const text = await extractTextFromPDF(file);
        const data = await parseTransferDocument(text, inventory, availableLocations);
        setPdfTransferData(data);
        setIsTransferModalOpen(true);
    } catch (error) {
        console.error("PDF Error", error);
        alert(t.matchError);
    } finally {
        setIsProcessingPdf(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col transition-colors ${language === 'ar' ? 'font-arabic' : ''}`}>
      <div className={`flex-1 flex flex-col transition-all duration-300 ${isAssistantOpen ? 'lg:mr-96 lg:rtl:mr-0 lg:rtl:ml-96' : ''}`}>
        
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20 transition-colors">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
              <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400 transition-colors flex-shrink-0">
                <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
              </button>
              <div className="overflow-hidden">
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 truncate">
                  {locationName} 
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-xs font-medium border border-brand-100 dark:border-brand-800">
                    {inventory.length}
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">{isGlobalView ? t.globalInventoryDesc : t.subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-3">
              <button onClick={() => setIsAssistantOpen(!isAssistantOpen)} className={`p-2 sm:px-4 sm:py-2 rounded-lg font-medium transition-all ${isAssistantOpen ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 ring-1 ring-brand-200 dark:ring-brand-800' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                <Sparkles className="w-4 h-4 text-brand-500 sm:mr-2 sm:rtl:ml-2 sm:rtl:mr-0 inline" />
                <span className="hidden sm:inline">{t.askAI}</span>
              </button>
              <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>
               <button onClick={onLogout} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600 dark:text-gray-500 rounded-lg transition-colors">
                <LogOut className="w-5 h-5 rtl:rotate-180" />
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 max-w-7xl mx-auto w-full">

          {/* Enhanced Notification Center */}
          {(groupedIncoming.length > 0 || outgoingTransfers.length > 0 || outgoingApprovals.length > 0) && (
            <div className="mb-8 space-y-6">
               <div className="flex items-center gap-2 mb-4">
                  <Bell className="w-5 h-5 sm:w-6 sm:h-6 text-brand-600" />
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{t.notificationCenter}</h2>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  {/* Incoming Section */}
                  <div className="space-y-4">
                     <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <ArrowDownCircle className="w-4 h-4 text-blue-500" /> {t.incomingRequests}
                     </h3>
                     <div className="space-y-3">
                        {groupedIncoming.map(([groupId, items]) => (
                           <div key={groupId} className="bg-white dark:bg-gray-800 rounded-xl border border-blue-100 dark:border-blue-900/30 p-4 sm:p-5 shadow-sm">
                              <div className="flex justify-between items-start mb-4">
                                 <div>
                                    <p className="text-xs text-gray-400 mb-1">{t.from}: <span className="text-gray-900 dark:text-white font-bold">{items[0].fromLocation}</span></p>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{items.length} {t.items} • {items.reduce((acc, curr) => acc + curr.quantity, 0)} {items[0].unit}</p>
                                 </div>
                                 <button onClick={() => handleDownloadTransfer(groupId, 'incoming')} className="p-2 text-gray-400 hover:text-brand-600 transition-colors" title={t.exportPDF}>
                                    <Download className="w-5 h-5" />
                                 </button>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                 <button onClick={() => setSelectedTransferGroup(groupId)} className="flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors">
                                    <Eye className="w-3 h-3" /> {t.viewItems}
                                 </button>
                                 <button onClick={() => handleBulkAccept(groupId)} className="flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors">
                                    <CheckCircle className="w-3 h-3" /> {t.accept}
                                 </button>
                                 <button onClick={() => setRejectionTarget(items[0])} className="flex items-center justify-center p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors" title={t.reject}>
                                    <XCircle className="w-5 h-5" />
                                 </button>
                              </div>
                           </div>
                        ))}
                        {groupedIncoming.length === 0 && <p className="text-sm text-gray-400 italic">{t.noItemsInList}</p>}
                     </div>
                  </div>

                  {/* Outgoing Section */}
                  <div className="space-y-4">
                     <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <ArrowUpCircle className="w-4 h-4 text-orange-500" /> {t.outgoingApprovals}
                     </h3>
                     <div className="space-y-3">
                        {outgoingApprovals.map((tx) => (
                           <div key={tx.id} className="bg-white dark:bg-gray-800 rounded-xl border border-orange-100 dark:border-orange-900/30 p-4 sm:p-5 shadow-sm flex justify-between items-center">
                              <div>
                                 <p className="text-xs text-gray-400 mb-1">{t.to}: <span className="text-gray-900 dark:text-white font-bold">{tx.toLocation}</span></p>
                                 <p className="text-sm font-semibold text-gray-900 dark:text-white">{tx.itemName}</p>
                                 <p className="text-xs text-gray-500">{tx.quantity} {tx.unit}</p>
                              </div>
                              <button onClick={() => onConfirmOutbound(tx)} className="flex items-center gap-2 px-3 py-2 bg-orange-100 text-orange-700 rounded-lg text-xs font-bold hover:bg-orange-200 transition-colors">
                                 {t.confirmOutbound}
                              </button>
                           </div>
                        ))}
                        {outgoingApprovals.length === 0 && <p className="text-sm text-gray-400 italic">{t.noTransactionsFound}</p>}
                     </div>
                  </div>
               </div>
            </div>
          )}

          {/* Action & Filter Bar */}
          <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
            {/* Search & Filter */}
            <div className="flex flex-1 gap-2 flex-wrap sm:flex-nowrap">
              <div className="relative flex-1 min-w-[200px] w-full max-w-md">
                <input
                  type="text"
                  placeholder={t.searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 rtl:pr-10 rtl:pl-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-gray-900 dark:text-white transition-all"
                />
                <Search className="w-5 h-5 text-gray-400 absolute left-3 rtl:right-3 rtl:left-auto top-3.5" />
              </div>

              {/* View Dropdown */}
              <div className="relative group">
                <button className="h-full px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200">
                    <LayoutGrid className="w-5 h-5" />
                    <span className="hidden sm:inline">{t.view}</span>
                    <ChevronDown className="w-4 h-4" />
                </button>
                <div className="absolute top-full left-0 rtl:right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 p-2 hidden group-hover:block z-20">
                     <p className="text-xs font-bold text-gray-400 px-3 py-2 uppercase">{t.view}</p>
                     <button onClick={() => setViewMode('grid')} className={`w-full text-left rtl:text-right px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${viewMode === 'grid' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>
                         <LayoutGrid className="w-4 h-4" /> {t.tiles}
                     </button>
                     <button onClick={() => setViewMode('list')} className={`w-full text-left rtl:text-right px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${viewMode === 'list' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>
                         <ListIcon className="w-4 h-4" /> {t.list}
                     </button>
                     <button onClick={() => setViewMode('compact')} className={`w-full text-left rtl:text-right px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${viewMode === 'compact' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>
                         <Grid3X3 className="w-4 h-4" /> {t.box}
                     </button>
                </div>
              </div>

              {/* Sort Dropdown */}
              <div className="relative group">
                <button className="h-full px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200">
                    <ArrowUpDown className="w-5 h-5" />
                    <span className="hidden sm:inline">{t.sortBy}</span>
                    <ChevronDown className="w-4 h-4" />
                </button>
                <div className="absolute top-full left-0 rtl:right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 p-2 hidden group-hover:block z-20">
                    <p className="text-xs font-bold text-gray-400 px-3 py-2 uppercase">{t.sortBy}</p>
                    <button onClick={() => setSortBy('name')} className={`w-full text-left rtl:text-right px-3 py-2 rounded-lg text-sm ${sortBy === 'name' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>{t.sortName}</button>
                    <button onClick={() => setSortBy('quantity')} className={`w-full text-left rtl:text-right px-3 py-2 rounded-lg text-sm ${sortBy === 'quantity' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>{t.sortQuantity}</button>
                    <button onClick={() => setSortBy('lastUpdated')} className={`w-full text-left rtl:text-right px-3 py-2 rounded-lg text-sm ${sortBy === 'lastUpdated' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>{t.sortDate}</button>
                    
                    <div className="my-2 border-t border-gray-100 dark:border-gray-700"></div>
                    
                    <p className="text-xs font-bold text-gray-400 px-3 py-2 uppercase">{t.order}</p>
                    <button onClick={() => setSortOrder('asc')} className={`w-full text-left rtl:text-right px-3 py-2 rounded-lg text-sm ${sortOrder === 'asc' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>{t.ascending}</button>
                    <button onClick={() => setSortOrder('desc')} className={`w-full text-left rtl:text-right px-3 py-2 rounded-lg text-sm ${sortOrder === 'desc' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>{t.descending}</button>
                </div>
              </div>

              <div className="relative group">
                <button className="h-full px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200">
                  <Filter className="w-5 h-5" />
                  <span className="hidden sm:inline">{t.filter}</span>
                  <ChevronDown className="w-4 h-4" />
                </button>
                <div className="absolute top-full left-0 rtl:right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 p-2 hidden group-hover:block z-20">
                    <p className="text-xs font-bold text-gray-400 px-3 py-2 uppercase">{t.category}</p>
                    <button onClick={() => setSelectedCategory('all')} className={`w-full text-left rtl:text-right px-3 py-2 rounded-lg text-sm ${selectedCategory === 'all' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>{t.allStatuses}</button>
                    {categories.map(cat => (
                        <button key={cat} onClick={() => setSelectedCategory(cat)} className={`w-full text-left rtl:text-right px-3 py-2 rounded-lg text-sm ${selectedCategory === cat ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>{cat}</button>
                    ))}
                    <div className="my-2 border-t border-gray-100 dark:border-gray-700"></div>
                    <p className="text-xs font-bold text-gray-400 px-3 py-2 uppercase">{t.stockStatus}</p>
                    <button onClick={() => setStockStatusFilter('all')} className={`w-full text-left rtl:text-right px-3 py-2 rounded-lg text-sm ${stockStatusFilter === 'all' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>{t.allStatuses}</button>
                    <button onClick={() => setStockStatusFilter('lowStock')} className={`w-full text-left rtl:text-right px-3 py-2 rounded-lg text-sm ${stockStatusFilter === 'lowStock' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>{t.lowStock}</button>
                    <button onClick={() => setStockStatusFilter('inStock')} className={`w-full text-left rtl:text-right px-3 py-2 rounded-lg text-sm ${stockStatusFilter === 'inStock' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>{t.inStock}</button>
                </div>
              </div>
            </div>
            
            {/* Actions */}
            {!isGlobalView && (
              <div className="flex gap-2">
                 <input type="file" ref={fileInputRef} className="hidden" accept=".pdf" onChange={handleFileUpload} />
                 <button onClick={() => fileInputRef.current?.click()} disabled={isProcessingPdf} className="flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-lg shadow-blue-200 dark:shadow-none disabled:opacity-50">
                    {isProcessingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                    <span className="hidden sm:inline">{t.smartUpload}</span>
                 </button>
                 <button onClick={() => setIsTransferModalOpen(true)} className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm">
                    <ArrowRightLeft className="w-5 h-5" />
                    <span className="hidden sm:inline">{t.transfer}</span>
                 </button>
                 <button onClick={() => { setItemToEdit(null); setIsAddItemModalOpen(true); }} className="flex items-center gap-2 px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium transition-colors shadow-lg shadow-brand-200 dark:shadow-none">
                    <Plus className="w-5 h-5" />
                    <span className="hidden sm:inline">{t.addItem}</span>
                 </button>
              </div>
            )}
          </div>

          {/* Stats Cards - Mobile Only */}
          <div className="grid grid-cols-2 gap-3 mb-6 lg:hidden">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                  <p className="text-xs text-gray-500 uppercase font-bold">{t.totalItems}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{filteredItems.length}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                  <p className="text-xs text-gray-500 uppercase font-bold">{t.lowStock}</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{lowStockItems.length}</p>
              </div>
          </div>

          {/* Inventory Container */}
          <div className={
              viewMode === 'list' ? 'flex flex-col gap-3' : 
              viewMode === 'compact' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3' : 
              'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
          }>
            {filteredItems.map(item => {
              const isLowStock = item.quantity <= item.minThreshold;

              // --- COMPACT BOX VIEW ---
              if (viewMode === 'compact') {
                  return (
                    <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-700 shadow-sm hover:shadow-md transition-all relative flex flex-col items-center text-center">
                        {isLowStock && <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>}
                        <div className={`p-2 rounded-full mb-2 ${isLowStock ? 'bg-red-50 dark:bg-red-900/20 text-red-600' : 'bg-brand-50 dark:bg-brand-900/20 text-brand-600'}`}>
                           <Package className="w-5 h-5" />
                        </div>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 line-clamp-1 w-full">{language === 'ar' ? item.nameAr : item.nameEn}</h3>
                        <p className={`text-lg font-bold mb-2 ${isLowStock ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>{item.quantity} <span className="text-[10px] text-gray-500">{item.unit}</span></p>
                        
                        {!isGlobalView && (
                             <div className="flex gap-1 w-full mt-auto">
                                <button onClick={() => { setItemToEdit(item); setIsAddItemModalOpen(true); }} className="flex-1 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-600"><Pencil className="w-3 h-3 mx-auto" /></button>
                                <button onClick={() => { setUsageItem(item); setIsUsageModalOpen(true); }} className="flex-1 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-600"><ArrowDownCircle className="w-3 h-3 mx-auto" /></button>
                             </div>
                        )}
                    </div>
                  );
              }

              // --- LIST VIEW ---
              if (viewMode === 'list') {
                  return (
                      <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl p-3 sm:p-4 border border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-700 shadow-sm flex items-center gap-4">
                          <div className={`p-3 rounded-lg hidden sm:block ${isLowStock ? 'bg-red-50 dark:bg-red-900/20 text-red-600' : 'bg-brand-50 dark:bg-brand-900/20 text-brand-600'}`}>
                              <Package className="w-6 h-6" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                  <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">{language === 'ar' ? item.nameAr : item.nameEn}</h3>
                                  {isLowStock && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 uppercase">{t.lowStock}</span>}
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-2">
                                  <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">{item.category}</span>
                                  {isGlobalView && item.locationId && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {item.locationId}</span>}
                              </p>
                          </div>

                          <div className="text-right whitespace-nowrap px-4">
                              <p className={`text-xl font-bold ${isLowStock ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                                  {item.quantity} <span className="text-sm text-gray-500 font-medium">{item.unit}</span>
                              </p>
                          </div>

                          {!isGlobalView && (
                             <div className="relative">
                                <button onClick={(e) => { e.stopPropagation(); setActiveActionId(activeActionId === item.id ? null : item.id); }} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors">
                                   <MoreVertical className="w-5 h-5" />
                                </button>
                                {activeActionId === item.id && (
                                   <div className="absolute right-0 rtl:right-auto rtl:left-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-20 z-[30]">
                                      <button onClick={() => { setItemToEdit(item); setIsAddItemModalOpen(true); setActiveActionId(null); }} className="w-full text-left rtl:text-right px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-2"><Pencil className="w-4 h-4" /> {t.edit}</button>
                                      <button onClick={() => { setUsageItem(item); setIsUsageModalOpen(true); setActiveActionId(null); }} className="w-full text-left rtl:text-right px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-2"><ArrowDownCircle className="w-4 h-4 text-red-500" /> {t.recordUsage}</button>
                                      <button onClick={() => { onDeleteItem(locationId, item.id); setActiveActionId(null); }} className="w-full text-left rtl:text-right px-4 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 flex items-center gap-2"><Trash2 className="w-4 h-4" /> {t.delete}</button>
                                   </div>
                                )}
                             </div>
                          )}
                      </div>
                  );
              }

              // --- GRID VIEW (DEFAULT) ---
              return (
                <div key={item.id} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-700 shadow-sm hover:shadow-md transition-all group relative">
                  
                  {isLowStock && (
                    <div className="absolute top-4 right-4 rtl:right-auto rtl:left-4 z-10">
                      <span className="flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-3 rounded-xl ${isLowStock ? 'bg-red-50 dark:bg-red-900/20 text-red-600' : 'bg-brand-50 dark:bg-brand-900/20 text-brand-600'}`}>
                      <Package className="w-6 h-6" />
                    </div>
                    
                    {!isGlobalView && (
                        <div className="relative">
                          <button onClick={(e) => { e.stopPropagation(); setActiveActionId(activeActionId === item.id ? null : item.id); }} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors">
                             <MoreVertical className="w-5 h-5" />
                          </button>
                          
                          {activeActionId === item.id && (
                             <div className="absolute right-0 rtl:right-auto rtl:left-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-20 animate-in fade-in zoom-in-95 duration-100 z-[30]">
                                <button onClick={() => { setItemToEdit(item); setIsAddItemModalOpen(true); setActiveActionId(null); }} className="w-full text-left rtl:text-right px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-2">
                                   <Pencil className="w-4 h-4" /> {t.edit}
                                </button>
                                <button onClick={() => { setUsageItem(item); setIsUsageModalOpen(true); setActiveActionId(null); }} className="w-full text-left rtl:text-right px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-2">
                                   <ArrowDownCircle className="w-4 h-4 text-red-500" /> {t.recordUsage}
                                </button>
                                <button onClick={() => { onDeleteItem(locationId, item.id); setActiveActionId(null); }} className="w-full text-left rtl:text-right px-4 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 flex items-center gap-2">
                                   <Trash2 className="w-4 h-4" /> {t.delete}
                                </button>
                             </div>
                          )}
                        </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1 line-clamp-1">{language === 'ar' ? item.nameAr : item.nameEn}</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-3">
                       <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-xs font-medium">{item.category}</span>
                       {isGlobalView && item.locationId && (
                           <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-medium"><MapPin className="w-3 h-3" /> {item.locationId}</span>
                       )}
                    </div>
                    
                    <div className="flex items-end justify-between mt-4">
                       <div>
                          <p className="text-xs text-gray-400 uppercase font-bold mb-0.5">{t.stockLevel}</p>
                          <p className={`text-2xl font-bold ${isLowStock ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                             {item.quantity} <span className="text-sm text-gray-500 font-medium">{item.unit}</span>
                          </p>
                       </div>
                       {isLowStock && (
                          <div className="text-right">
                             <p className="text-[10px] text-red-500 font-bold uppercase bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-full">{t.lowStockAlert}</p>
                          </div>
                       )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {filteredItems.length === 0 && (
             <div className="text-center py-20">
                <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                   <Package className="w-10 h-10 text-gray-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t.noItemsFound}</h3>
                <p className="text-gray-500 dark:text-gray-400">{t.tryAdjustingFilters}</p>
             </div>
          )}

        </main>
      </div>

      <SmartAssistant 
        locationName={locationName}
        items={inventory}
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        language={language}
      />

      <TransferModal
        isOpen={isTransferModalOpen}
        onClose={() => { setIsTransferModalOpen(false); setPdfTransferData(null); }}
        currentLocation={locationId}
        items={inventory}
        onTransfer={onTransfer}
        language={language}
        availableLocations={availableLocations}
        initialData={pdfTransferData}
      />

      <AddItemModal 
        isOpen={isAddItemModalOpen}
        onClose={() => setIsAddItemModalOpen(false)}
        onSubmit={(item) => onAddItem(locationId, item)}
        language={language}
        initialData={itemToEdit}
      />

      <UsageModal
        isOpen={isUsageModalOpen}
        onClose={() => setIsUsageModalOpen(false)}
        item={usageItem}
        onConfirm={(qty, notes) => onRecordUsage(usageItem!.id, qty, notes)}
        language={language}
      />

      {/* Rejection Modal */}
      {rejectionTarget && (
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
               <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t.rejectionReason}</h3>
               <textarea 
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl mb-4 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
                  placeholder={t.rejectionPlaceholder}
                  rows={3}
               />
               <div className="flex gap-3">
                  <button onClick={() => setRejectionTarget(null)} className="flex-1 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium">{t.cancel}</button>
                  <button onClick={handleReject} disabled={!rejectionReason.trim()} className="flex-1 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 disabled:opacity-50">{t.reject}</button>
               </div>
            </div>
         </div>
      )}

      {/* View Items Modal for Transfer Group */}
      {selectedTransferGroup && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t.transferDetails}</h3>
                      <button onClick={() => setSelectedTransferGroup(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                          <XCircle className="w-6 h-6 text-gray-500" />
                      </button>
                  </div>
                  <div className="space-y-3">
                      {(groupedIncoming.find(g => g[0] === selectedTransferGroup)?.[1] || []).map(tx => (
                          <div key={tx.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                              <span className="font-medium text-gray-900 dark:text-white">{tx.itemName}</span>
                              <span className="font-bold text-brand-600 dark:text-brand-400">{tx.quantity} {tx.unit}</span>
                          </div>
                      ))}
                  </div>
                  <div className="mt-6 flex gap-3">
                      <button onClick={() => handleBulkAccept(selectedTransferGroup)} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors">{t.accept}</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default InventoryDashboard;