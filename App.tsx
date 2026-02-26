import React, { useState, useEffect, useMemo, useRef } from 'react';
import Login from './components/Login';
import LocationSelection from './components/LocationSelection';
import InventoryDashboard from './components/InventoryDashboard';
import AdminDashboard from './components/AdminDashboard';
import MammalEmployeeDashboard from './components/MammalEmployeeDashboard';
import ThemeLanguageControls from './components/ThemeLanguageControls';
import { LocationId, Language, Theme, User, InventoryItem, Transaction, TransactionType, LocationData, TransactionStatus, UserRole } from './types';
import { LOCATIONS as STATIC_LOCATIONS, TRANSLATIONS, INITIAL_INVENTORY, INITIAL_USERS } from './constants';
import { supabase } from './services/supabase';

// Helper to generate IDs locally if backend is offline
const generateId = () => Math.random().toString(36).substr(2, 9);

const App: React.FC = () => {
  // Global Application State
  const [users, setUsers] = useState<User[]>([]);
  const [inventory, setInventory] = useState<Record<string, InventoryItem[]>>({});
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [locations, setLocations] = useState<LocationData[]>(STATIC_LOCATIONS);
  const [loading, setLoading] = useState(true);
  
  // Session State - Lazy initialization to prevent flicker
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
        const savedUserStr = localStorage.getItem('dawar_user');
        const expiryStr = localStorage.getItem('dawar_session_expiry');
        if (savedUserStr && expiryStr) {
            if (Date.now() < parseInt(expiryStr, 10)) {
                return JSON.parse(savedUserStr);
            }
            // Clear expired session
            localStorage.removeItem('dawar_user');
            localStorage.removeItem('dawar_session_expiry');
        }
    } catch (e) {
        console.error("Failed to restore session", e);
    }
    return null;
  });

  const [selectedLocation, setSelectedLocation] = useState<LocationId | null>(() => {
      try {
          const savedUserStr = localStorage.getItem('dawar_user');
          const expiryStr = localStorage.getItem('dawar_session_expiry');
          let user: User | null = null;
          
          if (savedUserStr && expiryStr && Date.now() < parseInt(expiryStr, 10)) {
              user = JSON.parse(savedUserStr);
          }

          if (user) {
            if (user.role === 'branch_manager') return user.branchCode || null;
            if (user.role === 'mammal_employee') return 'mammal';
            // Other roles usually want to select a location, so default to null
          }
      } catch (e) {
          console.error("Failed to restore location selection", e);
      }
      return null;
  });
  
  // Theme & Language State - Initialize from localStorage
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('dawar_language');
    return (saved === 'ar' || saved === 'en') ? saved : 'en';
  });
  
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('dawar_theme');
    return (saved === 'dark' || saved === 'light') ? saved : 'light';
  });

  // To prevent repeated notifications for the same transaction
  const notifiedIds = useRef<Set<string>>(new Set());

  // Handle document direction and theme class updates
  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Initial Data Fetch from Supabase with Fallback
  const fetchData = async () => {
    setLoading(true);
    let loadedUsers = INITIAL_USERS;
    let loadedInventory = INITIAL_INVENTORY;
    let loadedLocations = STATIC_LOCATIONS;
    let loadedTransactions: Transaction[] = [];

    try {
        // Fetch Locations
        const { data: locData, error: locError } = await supabase.from('locations').select('*');
        if (!locError && locData) {
            loadedLocations = locData.map((l: any) => ({
                id: l.id,
                name: l.name,
                description: l.description || '',
                icon: l.icon || 'store',
                type: l.type as 'central' | 'branch'
            }));
        }

        // Fetch Users
        const { data: usersData, error: usersError } = await supabase.from('app_users').select('*');
        if (!usersError && usersData && usersData.length > 0) {
            loadedUsers = usersData.map((u: any) => ({
                id: u.id,
                username: u.username,
                password: u.password,
                name: u.name,
                role: u.role as UserRole,
                branchCode: u.branch_code,
                branchName: u.branch_name,
                accessibleBranches: u.accessible_branches || []
            }));
        }

        // Fetch Inventory
        const { data: itemsData, error: itemsError } = await supabase.from('inventory_items').select('*');
        if (!itemsError && itemsData && itemsData.length > 0) {
            const newInventory: Record<string, InventoryItem[]> = {};
            itemsData.forEach((i: any) => {
                const item: InventoryItem = {
                    id: i.id,
                    nameEn: i.name_en,
                    nameAr: i.name_ar,
                    description: i.description,
                    category: i.category,
                    quantity: Number(i.quantity),
                    unit: i.unit,
                    minThreshold: Number(i.min_threshold),
                    lastUpdated: i.last_updated,
                    locationId: i.location_id
                };
                if (!newInventory[i.location_id]) newInventory[i.location_id] = [];
                newInventory[i.location_id].push(item);
            });
            loadedInventory = newInventory;
        }

        // Fetch Transactions - Ordered by Date Descending
        const { data: txData, error: txError } = await supabase
          .from('transactions')
          .select('*')
          .order('date', { ascending: false });
          
        if (!txError && txData) {
            loadedTransactions = txData.map((t: any) => ({
                id: t.id,
                transferGroupId: t.transfer_group_id,
                date: t.date,
                type: t.type as TransactionType,
                status: t.status as TransactionStatus,
                fromLocation: t.from_location,
                toLocation: t.to_location,
                itemName: t.item_name,
                quantity: Number(t.quantity),
                unit: t.unit,
                performedBy: t.performed_by,
                notes: t.notes,
                rejectionReason: t.rejection_reason
            }));
        }
    } catch (error) {
        console.warn("Backend connection failed or not configured. Using local fallback data.", error);
    } finally {
        setUsers(loadedUsers);
        setInventory(loadedInventory);
        setLocations(loadedLocations);
        setTransactions(loadedTransactions);
        setLoading(false);
    }
  };

  useEffect(() => {
      fetchData();

      // Set up real-time subscriptions
      const txSubscription = supabase
        .channel('transactions-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
          fetchData();
        })
        .subscribe();

      const invSubscription = supabase
        .channel('inventory-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => {
          fetchData();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(txSubscription);
        supabase.removeChannel(invSubscription);
      };
  }, []);

  // Request Notification Permission
  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
          await Notification.requestPermission();
      } catch (e) {
          console.warn("Notification permission request failed", e);
      }
    }
  };

  // Notification Trigger Effect
  useEffect(() => {
    if (!currentUser) return;

    // Filter relevant incoming transfers that haven't been notified yet
    const relevantIncoming = transactions.filter(t => 
      t.toLocation === selectedLocation && 
      t.status === 'pending_target' && 
      !notifiedIds.current.has(t.id)
    );

    if (relevantIncoming.length > 0) {
      const t_text = TRANSLATIONS[language];
      relevantIncoming.forEach(tx => {
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(t_text.incomingRequests, {
                body: `${tx.itemName}: ${tx.quantity} ${tx.unit} ${t_text.from} ${tx.fromLocation}`,
                icon: 'https://cdn-icons-png.flaticon.com/512/3081/3081840.png'
            });
          } catch (e) { console.error("Notification failed", e); }
        }
        notifiedIds.current.add(tx.id);
      });
    }
  }, [transactions, currentUser, selectedLocation, language]);

  // Dynamically calculate available locations based on state and permissions
  const availableLocations = useMemo<LocationData[]>(() => {
      // Filter based on user permissions
      if (currentUser) {
          if (currentUser.role === 'branch_manager') {
              const accessible = new Set(currentUser.accessibleBranches || []);
              accessible.add(currentUser.branchCode!);
              return locations.filter(loc => accessible.has(loc.id));
          }
          if (currentUser.role === 'mammal_employee') {
              return locations.filter(loc => loc.id === 'mammal');
          }
      }
      return locations;
  }, [locations, currentUser]);

  const toggleLanguage = () => {
    setLanguage(prev => {
        const newLang = prev === 'en' ? 'ar' : 'en';
        localStorage.setItem('dawar_language', newLang);
        return newLang;
    });
  };

  const toggleTheme = () => {
    setTheme(prev => {
        const newTheme = prev === 'light' ? 'dark' : 'light';
        localStorage.setItem('dawar_theme', newTheme);
        return newTheme;
    });
  };

  const handleLogin = (user: User, rememberMe: boolean) => {
    setCurrentUser(user);
    requestNotificationPermission();

    // Session persistence logic
    const duration = rememberMe 
      ? 30 * 24 * 60 * 60 * 1000 // 30 days
      : 60 * 60 * 1000; // 1 hour
      
    const expiry = Date.now() + duration;
    localStorage.setItem('dawar_user', JSON.stringify(user));
    localStorage.setItem('dawar_session_expiry', expiry.toString());

    if (user.role === 'warehouse_manager') {
       setSelectedLocation(null);
    } else if (user.role === 'branch_manager') {
       setSelectedLocation(user.branchCode || null);
    } else if (user.role === 'mammal_employee') {
       setSelectedLocation('mammal');
    } else {
      setSelectedLocation(null);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSelectedLocation(null);
    notifiedIds.current.clear();
    localStorage.removeItem('dawar_user');
    localStorage.removeItem('dawar_session_expiry');
  };

  const handleCreateUser = async (newUser: Omit<User, 'id'>) => {
    const tempId = generateId();
    // Optimistic Update
    const user: User = { ...newUser, id: tempId };
    setUsers(prev => [...prev, user]);

    if (newUser.role === 'branch_manager' && newUser.branchCode) {
        const newLoc: LocationData = {
            id: newUser.branchCode,
            name: newUser.branchName || newUser.branchCode,
            description: 'Branch Inventory',
            icon: 'store',
            type: 'branch'
        };
        setLocations(prev => {
            if (prev.some(l => l.id === newLoc.id)) return prev;
            return [...prev, newLoc];
        });
    }

    // Async Backend Call
    const { data, error } = await supabase.from('app_users').insert([{
        username: newUser.username,
        password: newUser.password,
        name: newUser.name,
        role: newUser.role,
        branch_code: newUser.branchCode,
        branch_name: newUser.branchName,
        accessible_branches: newUser.accessibleBranches || []
    }]).select();
    
    if (!error && data && data[0]) {
        const realUser: User = {
            id: data[0].id,
            username: data[0].username,
            password: data[0].password,
            name: data[0].name,
            role: data[0].role,
            branchCode: data[0].branch_code,
            branchName: data[0].branch_name,
            accessibleBranches: data[0].accessible_branches
        };
        setUsers(prev => prev.map(u => u.id === tempId ? realUser : u));
    }
  };

  const handleEditUser = async (updatedUser: User) => {
      // Optimistic Update
      setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));

      if (updatedUser.role === 'branch_manager' && updatedUser.branchCode) {
          const newLoc: LocationData = {
              id: updatedUser.branchCode,
              name: updatedUser.branchName || updatedUser.branchCode,
              description: 'Branch Inventory',
              icon: 'store',
              type: 'branch'
          };
          setLocations(prev => {
              const exists = prev.some(l => l.id === newLoc.id);
              if (exists) {
                  return prev.map(l => l.id === newLoc.id ? { ...l, name: newLoc.name } : l);
              }
              return [...prev, newLoc];
          });
      }

      const updates: any = {
        username: updatedUser.username,
        name: updatedUser.name,
        role: updatedUser.role,
        branch_code: updatedUser.branchCode,
        branch_name: updatedUser.branchName,
        accessible_branches: updatedUser.accessibleBranches || []
      };

      if (updatedUser.password && updatedUser.password.trim() !== '') {
          updates.password = updatedUser.password;
      }

      await supabase.from('app_users').update(updates).eq('id', updatedUser.id);
  };

  const handleDeleteUser = async (id: string) => {
    // Optimistic Update
    setUsers(prev => prev.filter(u => u.id !== id));
    await supabase.from('app_users').delete().eq('id', id);
  };

  const handleAddItem = async (locationId: string, item: Omit<InventoryItem, 'id' | 'lastUpdated'>) => {
      // Enforce branch manager restriction
      if (currentUser?.role === 'branch_manager' && currentUser.branchCode !== locationId) {
          console.error("Branch managers can only add items to their own branch.");
          return;
      }

      // Check for duplicates
      const existing = (inventory[locationId] || []).find(i => 
          i.nameEn.toLowerCase() === item.nameEn.toLowerCase() || 
          i.nameAr === item.nameAr
      );
      if (existing) {
          alert(language === 'ar' ? 'هذا المنتج موجود بالفعل في هذا الموقع' : 'This item already exists in this location');
          return;
      }

      const tempId = generateId();
      // Optimistic Update
      const newItem: InventoryItem = {
          ...item,
          id: tempId,
          lastUpdated: new Date().toISOString(),
          locationId
      };
      
      setInventory(prev => ({
          ...prev,
          [locationId]: [...(prev[locationId] || []), newItem]
      }));

      const { data, error } = await supabase.from('inventory_items').insert([{
          location_id: locationId,
          name_en: item.nameEn,
          name_ar: item.nameAr,
          description: item.description,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
          min_threshold: item.minThreshold
      }]).select();

      if (!error && data && data[0]) {
          const realItem: InventoryItem = {
              id: data[0].id,
              locationId: data[0].location_id,
              nameEn: data[0].name_en,
              nameAr: data[0].name_ar,
              description: data[0].description,
              category: data[0].category,
              quantity: data[0].quantity,
              unit: data[0].unit,
              minThreshold: data[0].min_threshold,
              lastUpdated: data[0].last_updated
          };
          setInventory(prev => ({
              ...prev,
              [locationId]: prev[locationId].map(i => i.id === tempId ? realItem : i)
          }));
      }
  };

  const handleEditItem = async (locationId: string, updatedItem: InventoryItem) => {
      // Check for duplicates (excluding the item itself)
      const existing = (inventory[locationId] || []).find(i => 
          i.id !== updatedItem.id && (
              i.nameEn.toLowerCase() === updatedItem.nameEn.toLowerCase() || 
              i.nameAr === updatedItem.nameAr
          )
      );
      if (existing) {
          alert(language === 'ar' ? 'هذا الاسم مستخدم بالفعل لمنتج آخر' : 'This name is already used by another item');
          return;
      }

      // Optimistic Update
      setInventory(prev => ({
          ...prev,
          [locationId]: (prev[locationId] || []).map(i => i.id === updatedItem.id ? updatedItem : i)
      }));

      await supabase.from('inventory_items').update({
          name_en: updatedItem.nameEn,
          name_ar: updatedItem.nameAr,
          description: updatedItem.description,
          category: updatedItem.category,
          quantity: updatedItem.quantity,
          unit: updatedItem.unit,
          min_threshold: updatedItem.minThreshold
      }).eq('id', updatedItem.id);
  };

  const handleDeleteItem = async (locationId: string, itemId: string) => {
     // Optimistic Update
     setInventory(prev => ({
         ...prev,
         [locationId]: (prev[locationId] || []).filter(i => i.id !== itemId)
     }));

     await supabase.from('inventory_items').delete().eq('id', itemId);
  };

  const handleBulkDeleteItems = async (locationId: string, itemIds: string[]) => {
      // Optimistic Update
      setInventory(prev => ({
          ...prev,
          [locationId]: (prev[locationId] || []).filter(i => !itemIds.includes(i.id))
      }));

      await supabase.from('inventory_items').delete().in('id', itemIds);
  };

  const handleBulkEditItems = async (locationId: string, itemIds: string[], updates: Partial<InventoryItem>) => {
      // Optimistic Update
      setInventory(prev => ({
          ...prev,
          [locationId]: (prev[locationId] || []).map(i => itemIds.includes(i.id) ? { ...i, ...updates } : i)
      }));

      const dbUpdates: any = {};
      if (updates.category) dbUpdates.category = updates.category;
      if (updates.unit) dbUpdates.unit = updates.unit;
      if (updates.minThreshold !== undefined) dbUpdates.min_threshold = updates.minThreshold;

      await supabase.from('inventory_items').update(dbUpdates).in('id', itemIds);
  };

  const handleTransfer = async (items: { itemId: string, quantity: number }[], toLocation: LocationId, sourceOverride?: LocationId) => {
    if (!currentUser) return;
    
    const fromLocation = sourceOverride || selectedLocation;
    if (!fromLocation || fromLocation === 'all') return;

    const isManagerOfSource = 
        (currentUser.role === 'branch_manager' && currentUser.branchCode === fromLocation) ||
        (currentUser.role === 'warehouse_manager' && (fromLocation === 'warehouse' || fromLocation === 'mammal')) ||
        (currentUser.role === 'admin');

    const status: TransactionStatus = isManagerOfSource ? 'pending_target' : 'pending_source';
    const transferGroupId = `GRP-${Date.now()}`;

    const newTransactions: Transaction[] = [];
    const updatedSourceInventory = [...(inventory[fromLocation] || [])];

    // Optimistic Update Loop
    for (const transferItem of items) {
        const sourceItemIndex = updatedSourceInventory.findIndex(i => i.id === transferItem.itemId);
        if (sourceItemIndex !== -1) {
            const sourceItem = updatedSourceInventory[sourceItemIndex];
            
            // Deduct from source locally if manager
            if (isManagerOfSource) {
                updatedSourceInventory[sourceItemIndex] = {
                    ...sourceItem,
                    quantity: sourceItem.quantity - transferItem.quantity
                };
            }

            newTransactions.push({
                id: generateId(),
                transferGroupId: transferGroupId,
                date: new Date().toISOString(),
                type: 'transfer',
                status: status,
                fromLocation: fromLocation,
                toLocation: toLocation,
                itemName: language === 'ar' ? sourceItem.nameAr : sourceItem.nameEn,
                quantity: transferItem.quantity,
                unit: sourceItem.unit,
                performedBy: currentUser.name
            });
        }
    }

    // Update Local State
    if (isManagerOfSource) {
        setInventory(prev => ({ ...prev, [fromLocation]: updatedSourceInventory }));
    }
    setTransactions(prev => [...newTransactions, ...prev]);

    // Backend Calls
    if (newTransactions.length > 0) {
        // Sync Inventory updates if manager
        if (isManagerOfSource) {
            for (const item of items) {
                 const sourceItem = (inventory[fromLocation] || []).find(i => i.id === item.itemId);
                 if (sourceItem) {
                     await supabase.from('inventory_items').update({
                        quantity: sourceItem.quantity - item.quantity
                     }).eq('id', item.itemId);
                 }
            }
        }
        
        // Save Transactions
        const dbTransactions = newTransactions.map(t => ({
            transfer_group_id: t.transferGroupId,
            date: t.date,
            type: 'transfer',
            status: t.status,
            from_location: t.fromLocation,
            to_location: t.toLocation,
            item_name: t.itemName,
            quantity: t.quantity,
            unit: t.unit,
            performed_by: t.performedBy
        }));
        
        const { data, error } = await supabase.from('transactions').insert(dbTransactions).select();
        
        if (!error && data) {
            // Map real IDs back to transactions
            setTransactions(prev => {
                let updated = [...prev];
                data.forEach((dbTx: any) => {
                    // Match by group and item name (best we can do since we don't have temp IDs in DB)
                    const index = updated.findIndex(t => 
                        t.transferGroupId === dbTx.transfer_group_id && 
                        t.itemName === dbTx.item_name &&
                        t.id.length < 15 // Check if it's a temp ID (random string vs UUID)
                    );
                    if (index !== -1) {
                        updated[index] = {
                            ...updated[index],
                            id: dbTx.id
                        };
                    }
                });
                return updated;
            });
        }
    }
  };

  const handleConfirmSourceTransfer = async (transaction: Transaction) => {
      if (!currentUser) return;
      
      const sourceItem = (inventory[transaction.fromLocation!] || []).find(i => i.nameEn === transaction.itemName || i.nameAr === transaction.itemName);
      
      // Optimistic Update
      if (sourceItem) {
          setInventory(prev => ({
              ...prev,
              [transaction.fromLocation!]: prev[transaction.fromLocation!].map(i => 
                  i.id === sourceItem.id ? { ...i, quantity: i.quantity - transaction.quantity } : i
              )
          }));
      }

      setTransactions(prev => prev.map(t => t.id === transaction.id ? { ...t, status: 'pending_target' } : t));

      // Backend
      if (sourceItem) {
          await supabase.from('inventory_items').update({
              quantity: sourceItem.quantity - transaction.quantity
          }).eq('id', sourceItem.id);
      }
      await supabase.from('transactions').update({ status: 'pending_target' }).eq('id', transaction.id);
  };

  const handleReceiveTransfer = async (transaction: Transaction) => {
      if (!currentUser) return;
      const targetLocation = transaction.toLocation!;
      
      // Optimistic Update
      const existingItems = inventory[targetLocation] || [];
      const destItem = existingItems.find(i => i.nameEn === transaction.itemName || i.nameAr === transaction.itemName);

      if (destItem) {
          setInventory(prev => ({
              ...prev,
              [targetLocation]: prev[targetLocation].map(i => 
                  i.id === destItem.id ? { ...i, quantity: i.quantity + transaction.quantity } : i
              )
          }));
      } else {
          const newItem: InventoryItem = {
              id: generateId(),
              locationId: targetLocation,
              nameEn: transaction.itemName,
              nameAr: transaction.itemName,
              category: 'Received',
              quantity: transaction.quantity,
              unit: transaction.unit,
              minThreshold: 0,
              lastUpdated: new Date().toISOString()
          };
          setInventory(prev => ({
              ...prev,
              [targetLocation]: [...(prev[targetLocation] || []), newItem]
          }));
      }

      setTransactions(prev => prev.map(t => t.id === transaction.id ? { ...t, status: 'completed' } : t));

      // Backend
      if (destItem) {
          await supabase.from('inventory_items').update({
              quantity: destItem.quantity + transaction.quantity
          }).eq('id', destItem.id);
      } else {
          await supabase.from('inventory_items').insert([{
              location_id: targetLocation,
              name_en: transaction.itemName,
              name_ar: transaction.itemName,
              category: 'Received',
              quantity: transaction.quantity,
              unit: transaction.unit,
              min_threshold: 0
          }]);
      }
      await supabase.from('transactions').update({ status: 'completed' }).eq('id', transaction.id);
  };

  const handleRejectTransfer = async (transaction: Transaction, reason: string) => {
      if (!currentUser) return;
      const sourceLocation = transaction.fromLocation!;
      const wasDeducted = transaction.status === 'pending_target';
      
      const sourceItem = (inventory[sourceLocation] || []).find(i => i.nameEn === transaction.itemName || i.nameAr === transaction.itemName);

      // Optimistic Update
      if (wasDeducted) {
          if (sourceItem) {
               setInventory(prev => ({
                  ...prev,
                  [sourceLocation]: prev[sourceLocation].map(i => 
                      i.id === sourceItem.id ? { ...i, quantity: i.quantity + transaction.quantity } : i
                  )
              }));
          } else {
              // Restore item
              const restoredItem: InventoryItem = {
                  id: generateId(),
                  locationId: sourceLocation,
                  nameEn: transaction.itemName,
                  nameAr: transaction.itemName,
                  category: 'Returned',
                  quantity: transaction.quantity,
                  unit: transaction.unit,
                  minThreshold: 0,
                  lastUpdated: new Date().toISOString()
              };
              setInventory(prev => ({
                  ...prev,
                  [sourceLocation]: [...(prev[sourceLocation] || []), restoredItem]
              }));
          }
      }

      setTransactions(prev => prev.map(t => t.id === transaction.id ? { ...t, status: 'rejected', rejectionReason: reason } : t));

      // Backend
      if (wasDeducted) {
          if (sourceItem) {
               await supabase.from('inventory_items').update({
                  quantity: sourceItem.quantity + transaction.quantity
              }).eq('id', sourceItem.id);
          } else {
              await supabase.from('inventory_items').insert([{
                  location_id: sourceLocation,
                  name_en: transaction.itemName,
                  name_ar: transaction.itemName,
                  category: 'Returned',
                  quantity: transaction.quantity,
                  unit: transaction.unit,
                  min_threshold: 0
              }]);
          }
      }
  
      await supabase.from('transactions').update({
          status: 'rejected',
          rejection_reason: reason
      }).eq('id', transaction.id);
  };

  const handleDailyLog = async (type: TransactionType, itemId: string, quantity: number, notes: string) => {
      if (!currentUser || !selectedLocation || selectedLocation === 'all') return;
      const location = selectedLocation;
      const item = (inventory[location] || []).find(i => i.id === itemId);
      
      if (item) {
          const newQty = type === 'usage' ? item.quantity - quantity : item.quantity + quantity;
          
          // Optimistic Update
          setInventory(prev => ({
              ...prev,
              [location]: prev[location].map(i => i.id === itemId ? { ...i, quantity: newQty } : i)
          }));

          const tempId = generateId();
          const newTx: Transaction = {
              id: tempId,
              date: new Date().toISOString(),
              type: type,
              status: 'completed',
              fromLocation: type === 'usage' ? location : 'External Supplier',
              toLocation: type === 'usage' ? 'Consumed' : location,
              itemName: language === 'ar' ? item.nameAr : item.nameEn,
              quantity: quantity,
              unit: item.unit,
              performedBy: currentUser.name,
              notes: notes
          };
          
          setTransactions(prev => [newTx, ...prev]);

          // Backend
          await supabase.from('inventory_items').update({ quantity: newQty }).eq('id', itemId);
          const { data, error } = await supabase.from('transactions').insert([{
              date: newTx.date,
              type: type,
              status: 'completed',
              from_location: newTx.fromLocation,
              to_location: newTx.toLocation,
              item_name: newTx.itemName,
              quantity: quantity,
              unit: item.unit,
              performed_by: currentUser.name,
              notes: notes
          }]).select();

          if (!error && data && data[0]) {
              const realTx: Transaction = {
                  id: data[0].id,
                  transferGroupId: data[0].transfer_group_id,
                  date: data[0].date,
                  type: data[0].type as any,
                  status: data[0].status as any,
                  fromLocation: data[0].from_location,
                  toLocation: data[0].to_location,
                  itemName: data[0].item_name,
                  quantity: data[0].quantity,
                  unit: data[0].unit,
                  performedBy: data[0].performed_by,
                  notes: data[0].notes,
                  rejectionReason: data[0].rejection_reason
              };
              setTransactions(prev => prev.map(t => t.id === tempId ? realTx : t));
          }
      }
  };

  const handleBulkLog = async (logs: { type: TransactionType, itemId: string, quantity: number, notes: string }[]) => {
      if (!currentUser || !selectedLocation || selectedLocation === 'all') return;
      
      // Optimistic Update
      const updatedLocationInventory = [...(inventory[selectedLocation] || [])];
      const newTransactions: Transaction[] = [];

      logs.forEach(log => {
          const idx = updatedLocationInventory.findIndex(i => i.id === log.itemId);
          if (idx !== -1) {
              const item = updatedLocationInventory[idx];
              const newQty = log.type === 'usage' ? item.quantity - log.quantity : item.quantity + log.quantity;
              updatedLocationInventory[idx] = { ...item, quantity: newQty };

              newTransactions.push({
                  id: generateId(),
                  date: new Date().toISOString(),
                  type: log.type,
                  status: 'completed',
                  fromLocation: log.type === 'usage' ? selectedLocation : 'External Supplier',
                  toLocation: log.type === 'usage' ? 'Consumed' : selectedLocation,
                  itemName: language === 'ar' ? item.nameAr : item.nameEn,
                  quantity: log.quantity,
                  unit: item.unit,
                  performedBy: currentUser.name,
                  notes: log.notes
              });
          }
      });

      setInventory(prev => ({ ...prev, [selectedLocation]: updatedLocationInventory }));
      setTransactions(prev => [...newTransactions, ...prev]);
      
      // Backend
      for (const log of logs) {
          const item = (inventory[selectedLocation] || []).find(i => i.id === log.itemId);
          if (item) {
               const newQty = log.type === 'usage' ? item.quantity - log.quantity : item.quantity + log.quantity;
               await supabase.from('inventory_items').update({ quantity: newQty }).eq('id', log.itemId);
          }
      }
      
      const dbTxs = newTransactions.map(t => ({
          date: t.date,
          type: t.type,
          status: 'completed',
          from_location: t.fromLocation,
          to_location: t.toLocation,
          item_name: t.itemName,
          quantity: t.quantity,
          unit: t.unit,
          performed_by: t.performedBy,
          notes: t.notes
      }));
      
      if (dbTxs.length > 0) {
          const { data, error } = await supabase.from('transactions').insert(dbTxs).select();
          if (!error && data) {
              setTransactions(prev => {
                  let updated = [...prev];
                  data.forEach((dbTx: any) => {
                      const index = updated.findIndex(t => 
                          t.itemName === dbTx.item_name && 
                          t.date === dbTx.date &&
                          t.id.length < 15
                      );
                      if (index !== -1) {
                          updated[index] = { ...updated[index], id: dbTx.id };
                      }
                  });
                  return updated;
              });
          }
      }
  };

  if (loading) {
      return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-brand-600 font-bold animate-pulse">Loading System...</div>;
  }

  if (!currentUser) {
    return (
      <div className={`font-sans antialiased text-gray-900 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors ${language === 'ar' ? 'font-arabic' : ''}`}>
        <ThemeLanguageControls language={language} theme={theme} onToggleLanguage={toggleLanguage} onToggleTheme={toggleTheme} />
        <Login onLogin={handleLogin} language={language} users={users} />
      </div>
    );
  }

  if (currentUser.role === 'admin' && !selectedLocation) {
     return (
        <div className={`font-sans antialiased text-gray-900 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors ${language === 'ar' ? 'font-arabic' : ''}`}>
            <ThemeLanguageControls language={language} theme={theme} onToggleLanguage={toggleLanguage} onToggleTheme={toggleTheme} />
            <AdminDashboard 
                users={users}
                transactions={transactions}
                inventory={inventory}
                onCreateUser={handleCreateUser}
                onEditUser={handleEditUser}
                onDeleteUser={handleDeleteUser}
                onDeleteItem={handleDeleteItem}
                onLogout={handleLogout}
                language={language}
                availableLocations={availableLocations}
                onManageLocation={setSelectedLocation}
            />
        </div>
     );
  }

  if (currentUser.role === 'mammal_employee' && selectedLocation === 'mammal') {
      return (
          <div className={`font-sans antialiased text-gray-900 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors ${language === 'ar' ? 'font-arabic' : ''}`}>
              <ThemeLanguageControls language={language} theme={theme} onToggleLanguage={toggleLanguage} onToggleTheme={toggleTheme} />
              <MammalEmployeeDashboard 
                  items={inventory['mammal'] || []}
                  onLogout={handleLogout}
                  language={language}
                  onLogTransaction={handleDailyLog}
                  onBulkLogTransaction={handleBulkLog}
                  userName={currentUser.name}
                  transactions={transactions}
              />
          </div>
      );
  }

  if (!selectedLocation) {
    return (
      <div className={`font-sans antialiased text-gray-900 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors ${language === 'ar' ? 'font-arabic' : ''}`}>
        <ThemeLanguageControls language={language} theme={theme} onToggleLanguage={toggleLanguage} onToggleTheme={toggleTheme} />
        <LocationSelection 
          onSelect={setSelectedLocation} 
          onLogout={handleLogout}
          language={language} 
          availableLocations={availableLocations}
          currentUserRole={currentUser.role}
        />
      </div>
    );
  }

  const displayInventory = selectedLocation === 'all' 
    ? Object.entries(inventory).flatMap(([locId, items]) => (items as InventoryItem[]).map(i => ({ ...i, locationId: locId })))
    : inventory[selectedLocation] || [];

  const incomingTransfers = transactions.filter(t => 
    (selectedLocation === 'all' ? true : t.toLocation === selectedLocation) && 
    t.status === 'pending_target'
  );

  const outgoingTransfers = transactions.filter(t => 
    (selectedLocation === 'all' ? true : t.fromLocation === selectedLocation) && 
    (t.status === 'pending_target' || t.status === 'pending_source')
  );

  const outgoingApprovals = transactions.filter(t => 
    (selectedLocation === 'all' ? true : t.fromLocation === selectedLocation) && 
    t.status === 'pending_source'
  );

  return (
    <div className={`font-sans antialiased text-gray-900 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors ${language === 'ar' ? 'font-arabic' : ''}`}>
      <ThemeLanguageControls language={language} theme={theme} onToggleLanguage={toggleLanguage} onToggleTheme={toggleTheme} />
      <InventoryDashboard 
        locationId={selectedLocation} 
        inventory={displayInventory}
        onBack={() => setSelectedLocation(null)}
        onLogout={handleLogout}
        language={language}
        onTransfer={handleTransfer}
        onAddItem={handleAddItem}
        onEditItem={handleEditItem}
        onDeleteItem={handleDeleteItem}
        onBulkDeleteItems={handleBulkDeleteItems}
        onBulkEditItems={handleBulkEditItems}
        onRecordUsage={(itemId, qty, notes) => handleDailyLog('usage', itemId, qty, notes)}
        userRole={currentUser.role}
        userBranchCode={currentUser.branchCode}
        incomingTransfers={incomingTransfers}
        outgoingTransfers={outgoingTransfers}
        outgoingApprovals={outgoingApprovals}
        onReceiveTransfer={handleReceiveTransfer}
        onRejectTransfer={handleRejectTransfer}
        onConfirmOutbound={handleConfirmSourceTransfer}
        availableLocations={availableLocations}
      />
    </div>
  );
};

export default App;