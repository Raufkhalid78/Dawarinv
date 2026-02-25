import React, { useState, useEffect } from 'react';
import { InventoryItem, LocationId, Language, LocationData } from '../types';
import { TRANSLATIONS } from '../constants';
import { ArrowRightLeft, AlertCircle, Plus, Trash2, List, MapPin, Search, X } from 'lucide-react';

interface TransferItem {
    itemId: string;
    itemName: string;
    quantity: number;
    unit: string;
}

interface TransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentLocation: LocationId;
    items: InventoryItem[]; 
    onTransfer: (transferItems: { itemId: string, quantity: number }[], toLocation: LocationId, sourceOverride?: LocationId) => void;
    language: Language;
    availableLocations: LocationData[];
    initialData?: {
        targetLocationId: string | null;
        items: { itemId: string; quantity: number }[];
    } | null;
}

const TransferModal: React.FC<TransferModalProps> = ({ 
    isOpen, 
    onClose, 
    currentLocation, 
    items, 
    onTransfer, 
    language,
    availableLocations,
    initialData
}) => {
    const t = TRANSLATIONS[language];
    const isGlobal = currentLocation === 'all';
    
    const [sourceLocation, setSourceLocation] = useState<LocationId>(isGlobal ? '' : currentLocation);
    const [targetLocation, setTargetLocation] = useState<LocationId>('');
    const [selectedItemId, setSelectedItemId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [transferList, setTransferList] = useState<TransferItem[]>([]);
    const [error, setError] = useState('');

    const sources = availableLocations;
    const destinations = availableLocations.filter(l => l.id !== sourceLocation);

    useEffect(() => {
        if (isOpen) {
            setError('');
            if (!isGlobal) setSourceLocation(currentLocation);
            
            if (initialData) {
                setTargetLocation(initialData.targetLocationId || '');
                const list: TransferItem[] = initialData.items.map(di => {
                    const item = items.find(i => i.id === di.itemId);
                    return {
                        itemId: di.itemId,
                        itemName: item ? (language === 'ar' ? item.nameAr : item.nameEn) : 'Unknown',
                        quantity: di.quantity,
                        unit: item?.unit || ''
                    };
                });
                setTransferList(list);
            } else {
                setTransferList([]);
                setTargetLocation('');
            }
            
            setSelectedItemId('');
            setQuantity('');
        }
    }, [isOpen, currentLocation, isGlobal, initialData, items, language]);

    const availableItemsForSource = items.filter(i => isGlobal ? i.locationId === sourceLocation : true);

    const handleAddItem = () => {
        setError('');
        if (!selectedItemId) { setError(t.selectItem); return; }
        const item = availableItemsForSource.find(i => i.id === selectedItemId);
        if (!item) return;
        const qty = Number(quantity);
        if (qty <= 0) { setError(t.qtyGreaterZero); return; }
        if (qty > item.quantity) { setError(`${t.insufficientStock} (Max: ${item.quantity})`); return; }

        const existing = transferList.find(i => i.itemId === selectedItemId);
        const name = language === 'ar' ? item.nameAr : item.nameEn;
        if (existing) {
            setTransferList(prev => prev.map(i => i.itemId === selectedItemId ? { ...i, quantity: i.quantity + qty } : i));
        } else {
            setTransferList(prev => [...prev, { itemId: item.id, itemName: name, quantity: qty, unit: item.unit }]);
        }
        setSelectedItemId('');
        setQuantity('');
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (transferList.length === 0) { setError(t.noItemsInList); return; }
        if (!targetLocation) { setError(t.selectLocation); return; }
        onTransfer(transferList.map(item => ({ itemId: item.itemId, quantity: item.quantity })), targetLocation, sourceLocation);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className={`fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-2 sm:p-4 ${language === 'ar' ? 'font-arabic' : ''}`}>
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh]">
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-50 dark:bg-brand-900/30 rounded-lg"><ArrowRightLeft className="w-5 h-5 text-brand-600" /></div>
                        <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{t.transferStock}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 overflow-y-auto flex-grow space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t.from}</label>
                            {isGlobal ? (
                                <select value={sourceLocation} onChange={(e) => { setSourceLocation(e.target.value); setTransferList([]); }} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-brand-500">
                                    <option value="">{t.selectLocation}...</option>
                                    {sources.map(loc => <option key={loc.id} value={loc.id}>{loc.id === 'warehouse' ? t.warehouse : loc.id === 'mammal' ? t.mammal : loc.name}</option>)}
                                </select>
                            ) : (
                                <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900 rounded-xl text-sm font-bold border border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300">{sourceLocation === 'warehouse' ? t.warehouse : sourceLocation === 'mammal' ? t.mammal : sourceLocation}</div>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{t.to}</label>
                            <select value={targetLocation} onChange={(e) => setTargetLocation(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-brand-500">
                                <option value="">{t.selectLocation}...</option>
                                {destinations.map(loc => <option key={loc.id} value={loc.id}>{loc.id === 'warehouse' ? t.warehouse : loc.id === 'mammal' ? t.mammal : loc.name}</option>)}
                            </select>
                        </div>
                    </div>

                    {sourceLocation && (
                        <div className="p-4 bg-brand-50 dark:bg-brand-900/10 rounded-2xl border border-brand-100 dark:border-brand-900/30">
                            <div className="space-y-3">
                                <label className="block text-xs font-bold text-brand-700 dark:text-brand-300 uppercase">{t.selectItem}</label>
                                <select value={selectedItemId} onChange={(e) => { setSelectedItemId(e.target.value); setError(''); }} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-brand-500">
                                    <option value="">{t.selectItem}...</option>
                                    {availableItemsForSource.map(item => <option key={item.id} value={item.id}>{(language === 'ar' ? item.nameAr : item.nameEn)} ({item.quantity} {item.unit})</option>)}
                                </select>
                                <div className="flex gap-2">
                                    <input type="number" value={quantity} onChange={(e) => { setQuantity(e.target.value); setError(''); }} className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-brand-500" placeholder={t.quantity} />
                                    <button type="button" onClick={handleAddItem} className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-bold shadow-sm active:scale-95 transition-transform">{t.addToTransfer}</button>
                                </div>
                                {error && <div className="text-red-500 text-[10px] font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</div>}
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-2"><List className="w-4 h-4" /> {t.transferList}</h3>
                        <div className="border border-gray-100 dark:border-gray-700 rounded-2xl bg-gray-50/50 dark:bg-gray-900/50 min-h-[100px] overflow-hidden">
                            {transferList.length === 0 ? (
                                <div className="py-12 text-center text-gray-400 text-xs italic">{t.noItemsInList}</div>
                            ) : (
                                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {transferList.map(item => (
                                        <div key={item.itemId} className="flex justify-between items-center p-3 bg-white dark:bg-gray-800">
                                            <div className="overflow-hidden mr-2">
                                                <p className="font-bold text-xs sm:text-sm truncate text-gray-900 dark:text-white">{item.itemName}</p>
                                                <p className="text-[10px] text-gray-400">{item.quantity} {item.unit}</p>
                                            </div>
                                            <button onClick={() => setTransferList(prev => prev.filter(i => i.itemId !== item.itemId))} className="p-2 text-red-400 hover:text-red-600 transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-5 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-2xl transition-all text-sm">{t.cancel}</button>
                    <button onClick={handleSubmit} disabled={transferList.length === 0 || !targetLocation} className="flex-1 px-4 py-3 bg-brand-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-2xl font-bold transition-all shadow-lg text-sm">{t.submitTransfer}</button>
                </div>
            </div>
        </div>
    );
};

export default TransferModal;