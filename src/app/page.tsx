"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'movimientos' | 'productos'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Sub-menus
  const [subTabMov, setSubTabMov] = useState<'menu' | 'entradas' | 'salidas'>('menu');
  const [subTabProd, setSubTabProd] = useState<'nuevo' | 'modificar' | 'importar'>('nuevo');

  // Estados Globales
  const [products, setProducts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [recentTrans, setRecentTrans] = useState<any[]>([]);
  
  // Modificadores
  const [selectedProductStat, setSelectedProductStat] = useState<any>(null);
  const [editSelectedStatus, setEditSelectedStatus] = useState<any>(null);
  
  // Autocompletado Búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Fechas (Se mantendrán iguales para tu backend real)
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(String(now.getFullYear()));
  
  // Fechas Independientes para Auditoría
  const [auditoriaMonth, setAuditoriaMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [auditoriaYear, setAuditoriaYear] = useState(String(now.getFullYear()));
  
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh(); 
  };

  useEffect(() => {
    fetchProducts();
    if (activeTab === 'movimientos') fetchRecentTransactions();
    if (activeTab === 'dashboard') fetchSummary();
  }, [activeTab, month, year, auditoriaMonth, auditoriaYear]);

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      let data = await res.json();
      if (Array.isArray(data)) {
        // ORDEN ALFABÉTICO ESTRICTO POR DESCRIPCIÓN 
        data.sort((a, b) => (a.descripcion || '').localeCompare(b.descripcion || ''));
        setProducts(data);
      }
    } catch(err) { console.error("Error", err) }
  };

  const fetchSummary = async () => {
    try {
      const res = await fetch(`/api/summary?month=${month}&year=${year}`);
      let data = await res.json();
      if (Array.isArray(data)) {
        // ORDEN ALFABÉTICO ESTRICTO EN EL CUADRE MENSUAL
        data.sort((a, b) => (a.product?.descripcion || '').localeCompare(b.product?.descripcion || ''));
        setSummary(data);
      }
    } catch(err) { console.error("Error", err) }
  };

  const fetchRecentTransactions = async () => {
    try {
      const res = await fetch(`/api/transactions?month=${auditoriaMonth}&year=${auditoriaYear}`);
      if (res.ok) {
        const data = await res.json();
        // Cuando hay mes y año específico mostramos TODOS los de ese mes, sin el limite absurdo de los ultimos 50 globales.
        if (Array.isArray(data)) setRecentTrans(data);
      }
    } catch(err) { console.error("Error", err) }
  };

  const handleProductSelect = async (codigo: string) => {
    if (!codigo) {
      setSelectedProductStat(null);
      return;
    }
    const res = await fetch(`/api/products?codigo=${codigo}`);
    if (res.ok) {
      const data = await res.json();
      setSelectedProductStat(data);
    } else {
      setSelectedProductStat(null);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = {
      marca: (form.elements.namedItem('marca') as HTMLInputElement).value,
      codigo: (form.elements.namedItem('codigo') as HTMLInputElement).value,
      descripcion: (form.elements.namedItem('descripcion') as HTMLInputElement).value,
    };
    const res = await fetch('/api/products', { method: 'POST', body: JSON.stringify(data) });
    if (res.ok) {
      form.reset();
      fetchProducts();
      alert('Producto agregado con éxito');
    }
  };

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = {
      id: (form.elements.namedItem('id') as HTMLSelectElement).value,
      marca: (form.elements.namedItem('marca') as HTMLInputElement).value,
      codigo: (form.elements.namedItem('codigo') as HTMLInputElement).value,
      descripcion: (form.elements.namedItem('descripcion') as HTMLInputElement).value,
    };
    const res = await fetch('/api/products', { method: 'PUT', body: JSON.stringify(data) });
    if (res.ok) {
      form.reset();
      fetchProducts();
      setEditSelectedStatus(null);
      alert('Producto modificado con éxito');
      setSubTabProd('nuevo');
    }
  };

  const handleTransaction = async (e: React.FormEvent, isEntrada: boolean) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    
    if (!selectedProductStat) {
      alert("Primero debes consultar y seleccionar un producto válido.");
      return;
    }

    const qtyData = parseFloat((form.elements.namedItem('quantity') as HTMLInputElement).value);
    const costData = isEntrada 
      ? parseFloat((form.elements.namedItem('costo_unitario') as HTMLInputElement).value)
      : selectedProductStat.costoPromedio;

    let typeData = isEntrada ? 'entrada' : (form.elements.namedItem('sub_type') as HTMLSelectElement).value;

    const data = {
      product_id: selectedProductStat.id,
      type: typeData,
      quantity: qtyData,
      date: (form.elements.namedItem('date') as HTMLInputElement).value,
      costo_unitario: costData,
      factura: form.elements.namedItem('factura') ? (form.elements.namedItem('factura') as HTMLInputElement).value : '',
      destino: form.elements.namedItem('destino') ? (form.elements.namedItem('destino') as HTMLInputElement).value : ''
    };

    const res = await fetch('/api/transactions', { method: 'POST', body: JSON.stringify(data) });

    if (res.ok) {
      form.reset();
      setSelectedProductStat(null);
      alert('Movimiento procesado y valorizado con éxito.');
      setSubTabMov('menu');
      fetchRecentTransactions();
    } else {
      const err = await res.json();
      alert('Error: ' + err.error);
    }
  };

  const handleDeleteTransaction = async (id: number) => {
    if(window.confirm("⚠️ ¿Confirmas y autorizas Anular este registro contable permanentemente?")) {
      const res = await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' });
      if(res.ok) {
        alert("Eliminado limpiamente.");
        fetchRecentTransactions();
        fetchProducts();
      } else {
        alert("Hubo un error anulando la fila.");
      }
    }
  };

  const formatBs = (num: number) => `Bs ${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const navLinkClass = (isActive: boolean) => 
    `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors font-medium w-full text-left cursor-pointer ${
      isActive 
      ? 'bg-brand-primary text-white shadow-sm' 
      : 'text-brand-textMuted hover:text-white hover:bg-brand-border/30'
    }`;

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json: any[] = XLSX.utils.sheet_to_json(sheet);

        if (json.length === 0) {
          alert('⚠️ ERROR DE CONTENIDO: El archivo Excel está completamente vacío.');
          return;
        }

        const firstRow = json[0];
        // Buscamos estrictamente código, marca, descripción. Permisivos en mayus/minuscula y acentos ausentes.
        const strictKeys = ['codigo', 'marca', 'descripcion'];
        const headers = Object.keys(firstRow).map(k => k.trim().toLowerCase());
        
        const hasStrictColumns = strictKeys.every(key => headers.includes(key));

        if (!hasStrictColumns) {
          alert('🚫 ACCESO DENEGADO (SISTEMA ESTRICTO):\\nLa Hoja 1 de tu Excel NO cumple el formato obligatorio. Debes colocar SI o SI en la primera fila estas tres casillas literal:\\n\\ncodigo, marca, descripcion');
          return;
        }

        if(!window.confirm(`🟢 ESCÁNER APROBADO.\\nSe detectaron ${json.length} productos listos para carga.\\n¿Autorizas inyectarlos directamente en la Bóveda de Supabase de una sola vez?`)) return;

        const supabase = createClient();
        const cleanedData = json.map(row => {
            const keys = Object.keys(row);
            return {
                codigo: String(row[keys.find(k => k.trim().toLowerCase() === 'codigo') as string]).trim(),
                marca: String(row[keys.find(k => k.trim().toLowerCase() === 'marca') as string]).trim(),
                descripcion: String(row[keys.find(k => k.trim().toLowerCase() === 'descripcion') as string]).trim(),
                is_active: 1
            };
        });

        // Usamos upsert para que actualice descripciones en códigos viejos y meta los nuevos a la base de datos real
        const { error } = await supabase.from('products').upsert(cleanedData, { onConflict: 'codigo' });
        
        if (error) {
          alert('❌ REBOTE DEL SERVIDOR:\\nNo pude insertar en la bóveda: ' + error.message);
        } else {
          alert('🎊 ¡CARGA MASIVA EXITOSA!\\nTodos los productos bajaron a tierra firme en la base de datos oficial.\\n(En cuestión de milisegundos).');
          fetchProducts();
          setSubTabProd('nuevo');
        }
      } catch (err) {
        alert('❌ ERROR FATAL DE LECTURA:\\nEl archivo está corrompido o es ilegible por el traductor XLSX.');
      }
    };
    reader.readAsBinaryString(file);
    // Limpiamos el input para que lo pueda volver a usar
    e.target.value = '';
  };

  return (
    <div className="h-screen flex overflow-hidden font-['Inter']">
      
      {/* SIDEBAR TIPO PREMIUM */}
      <aside className={`bg-brand-sidebar flex-shrink-0 flex flex-col border-r border-brand-border h-full transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden border-none opacity-0'}`}>
        <div className="p-6 whitespace-nowrap">
          <h1 className="text-xl font-bold text-white leading-tight">Inventario y Finanzas<br/>Karina</h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto mt-4">
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={navLinkClass(activeTab === 'dashboard')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
            Libro Contable
          </button>
          
          <button 
            onClick={() => { setActiveTab('movimientos'); setSubTabMov('menu'); }} 
            className={navLinkClass(activeTab === 'movimientos')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
            Movimientos Registrados
          </button>
          
          <button 
            onClick={() => setActiveTab('productos')} 
            className={navLinkClass(activeTab === 'productos')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
            Base de Productos
          </button>
          
          {/* Boton Inactivo Decorativo del Mockup */}
          <button className={navLinkClass(false)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
            Configuración del Sistema
          </button>
        </nav>
      </aside>

      {/* REA PRINCIPAL DE CONTENIDO */}
      <main className="flex-1 flex flex-col h-full bg-brand-bg overflow-hidden text-brand-text">
        {/* TOPBAR */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-brand-border/50">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-brand-textMuted hover:text-white focus:outline-none transition-transform hover:scale-110">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </button>
          <div className="flex items-center gap-4">
            <button className="text-brand-textMuted hover:text-brand-primary transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
            </button>
            <button className="w-8 h-8 rounded-full bg-brand-border flex items-center justify-center text-white focus:outline-none ring-2 ring-transparent hover:ring-brand-primary">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
            </button>
          </div>
        </header>

        {/* CONTENIDO DESLIZABLE */}
        <div className="flex-1 overflow-y-auto p-8">
          
          <div className="mb-6">
            <div className="text-sm text-brand-textMuted mb-2 flex items-center gap-2">
              <span className="hover:text-white cursor-pointer">Inicio</span>
              <span>&gt;</span>
              <span className="hover:text-white cursor-pointer">{activeTab === 'dashboard' ? 'Libro Contable' : (activeTab==='movimientos'?'Movimientos':'Productos')}</span>
              <span>&gt;</span>
              <span className="text-white capitalize">{activeTab === 'dashboard' ? 'Mensual' : activeTab}</span>
            </div>
            <h2 className="text-3xl font-bold text-white tracking-tight">
              {activeTab === 'dashboard' && 'Libro Contable Mensual'}
              {activeTab === 'movimientos' && 'Auditoría de Movimientos'}
              {activeTab === 'productos' && 'Administración de Catálogo'}
            </h2>
          </div>

          {/* ======================= TAB: DASHBOARD ======================= */}
          {activeTab === 'dashboard' && (
            <>
              {/* FILTROS Y BOTONES SUPERIORES */}
              <section className="bg-brand-panel rounded-xl p-6 mb-6 shadow-sm border border-brand-border/30">
                <div className="flex flex-col lg:flex-row justify-between items-end gap-6">
                  <div className="flex gap-6 w-full lg:w-auto">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-brand-textMuted">Mes de Evaluación</label>
                      <select className="bg-brand-bg border border-brand-border text-white text-sm rounded-lg focus:ring-brand-primary focus:border-brand-primary block w-32 p-2.5 outline-none" value={month} onChange={e => setMonth(e.target.value)}>
                        {Array.from({length: 12}).map((_, i) => {
                          const m = String(i + 1).padStart(2, '0');
                          return <option key={m} value={m}>{m}</option>
                        })}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-brand-textMuted">Año (Fiscal)</label>
                      <input type="number" className="bg-brand-bg border border-brand-border text-white text-sm rounded-lg focus:ring-brand-primary focus:border-brand-primary block w-32 p-2.5 outline-none" value={year} onChange={e => setYear(e.target.value)} />
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-4 w-full lg:w-auto mt-4 lg:mt-0">
                    <button onClick={handleLogout} className="flex items-center gap-2 bg-brand-red hover:bg-red-500 text-white font-medium rounded-lg text-sm px-5 py-2.5 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                      Cerrar Sesión Segura
                    </button>
                    <label className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primaryHover text-white font-medium rounded-lg text-sm px-5 py-2.5 transition-colors cursor-pointer">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                      Importar Excel
                      <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelImport} />
                    </label>
                    <a href={`/api/export?month=${month}&year=${year}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-brand-green hover:bg-green-500 text-white font-medium rounded-lg text-sm px-5 py-2.5 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                      Exportar a Excel Oficial
                    </a>
                  </div>
                </div>
              </section>

              {/* TABLA OSCURA CORPORATIVA */}
              <section className="bg-brand-panel rounded-xl p-6 shadow-sm border border-brand-border/30 flex flex-col min-h-[500px]">
                <h3 className="text-lg font-semibold text-white mb-6">Libro de Entrada y Salida ({month}/{year})</h3>
                <div className="flex-1 bg-brand-tableBg rounded-lg overflow-hidden border border-brand-border/50 flex flex-col pb-4 h-full">
                  
                  {/* Encabezados Courier Prime del Mockup */}
                  <div className="grid grid-cols-8 gap-4 p-4 border-b border-brand-border bg-[#161B2A] text-brand-textMuted table-header items-center sticky top-0">
                    <div className="col-span-1 text-center font-bold">CÓDIGO</div>
                    <div className="col-span-1 text-center font-bold">DESCRIPCIÓN</div>
                    <div className="col-span-1 text-center font-bold leading-tight">INV.<br/>INICIAL<br/>(U) / BS</div>
                    <div className="col-span-1 text-center font-bold leading-tight text-xs lg:text-sm">COSTO<br/>PROMEDIO<br/>MENSUAL</div>
                    <div className="col-span-1 text-center font-bold leading-tight">ENTRADAS<br/>(U) / TOTAL</div>
                    <div className="col-span-1 text-center font-bold leading-tight">SALIDAS<br/>(VENTAS)<br/>(U) / TOTAL</div>
                    <div className="col-span-1 text-center font-bold leading-tight">RET/CONSU<br/>(U)</div>
                    <div className="col-span-1 text-center font-bold leading-tight">INV.<br/>FINAL<br/>(U) / (BS)</div>
                  </div>

                  {summary.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#1E2336] opacity-80 mt-10 rounded-b-lg">
                      <svg className="w-24 h-24 text-brand-border mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"></path>
                        <circle cx="17" cy="17" r="4" fill="#1E2336" stroke="currentColor" strokeWidth="1.5"></circle>
                      </svg>
                      <p className="text-brand-textMuted text-center">No hay registros.<br/>Cambia el mes o agrega Movimientos.</p>
                    </div>
                  ) : (
                    <div className="overflow-y-auto">
                      {summary.map((s, idx) => {
                        const sumLoses = s.loses + s.consumes;
                        return (
                          <div key={idx} className="grid grid-cols-8 gap-4 px-4 py-3 border-b border-brand-border/30 items-center text-sm hover:bg-brand-sidebar/40 transition">
                            <div className="col-span-1 text-center font-bold text-white">{s.product.codigo} {s.product.is_active?'':'🚫'}</div>
                            <div className="col-span-1 text-center text-brand-textMuted">{s.product.descripcion}</div>
                            <div className="col-span-1 text-center text-gray-400">
                              <span className="block">{s.initialStock} u</span>
                              <span className="block text-xs">{formatBs(s.initialTotalBs)}</span>
                            </div>
                            <div className="col-span-1 text-center font-bold text-yellow-500">
                              {formatBs(s.costoPromedio)}
                            </div>
                            <div className="col-span-1 text-center text-brand-green">
                              <span className="block">+{s.entries} u</span>
                              <span className="block text-xs">{formatBs(s.entriesBs)}</span>
                            </div>
                            <div className="col-span-1 text-center text-brand-primary">
                              <span className="block">-{s.sales} u</span>
                              <span className="block text-xs">{formatBs(s.salesBs)}</span>
                            </div>
                            <div className="col-span-1 text-center text-brand-red font-medium">-{sumLoses} u</div>
                            <div className="col-span-1 text-center font-bold text-white">
                              <span className="block text-base">{s.finalStock} u</span>
                              <span className="block text-brand-green text-xs">{formatBs(s.finalTotalBs)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {/* ======================= TAB: MOVIMIENTOS ======================= */}
          {activeTab === 'movimientos' && (
            <div className="space-y-6">
              {subTabMov === 'menu' && (
                <div className="grid grid-cols-2 gap-8 max-w-4xl mx-auto mt-10">
                  <button onClick={()=>setSubTabMov('entradas')} className="h-48 rounded-xl border-2 border-brand-border bg-brand-panel hover:border-brand-primary hover:bg-brand-sidebar transition flex flex-col items-center justify-center gap-4 group">
                    <span className="text-5xl group-hover:-translate-y-2 transition duration-300">📥</span>
                    <span className="text-xl font-bold text-white">Facturar ENTRADAS</span>
                  </button>
                  <button onClick={()=>setSubTabMov('salidas')} className="h-48 rounded-xl border-2 border-brand-border bg-brand-panel hover:border-brand-primary hover:bg-brand-sidebar transition flex flex-col items-center justify-center gap-4 group">
                    <span className="text-5xl group-hover:-translate-y-2 transition duration-300">📤</span>
                    <span className="text-xl font-bold text-white">Facturar SALIDAS</span>
                  </button>
                </div>
              )}

              {(subTabMov === 'entradas' || subTabMov === 'salidas') && (
                <div className="bg-brand-panel rounded-xl p-8 border border-brand-border/30 max-w-4xl mx-auto">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white">{subTabMov === 'entradas' ? 'Ingreso a Bóveda' : 'Salida de Inventario (Ventas)'}</h2>
                    <button onClick={()=>setSubTabMov('menu')} className="text-brand-textMuted hover:text-white px-4 py-2 rounded-lg bg-brand-border/30">✕ Cancelar</button>
                  </div>

                  <form onSubmit={(e)=>handleTransaction(e, subTabMov==='entradas')} className="grid grid-cols-2 gap-8">
                    {/* Tarjeta Consulta */}
                    <div className="bg-brand-bg rounded-xl border border-brand-border p-6 shadow-sm relative pt-8">
                      <span className="absolute -top-3 left-4 bg-brand-bg px-2 text-brand-primary font-bold text-sm tracking-widest">PASO 1: BÚSQUEDA</span>
                      
                      <div className="space-y-4">
                        <div className="relative">
                          <label className="block text-sm text-brand-textMuted mb-1">Buscar Código o Nombre</label>
                          <input 
                            type="text" 
                            placeholder="Tipea para buscar..."
                            value={searchTerm}
                            onClick={() => setShowDropdown(true)}
                            onChange={(e) => {
                              setSearchTerm(e.target.value);
                              setShowDropdown(true);
                              if (e.target.value === '') { setSelectedProductStat(null); }
                            }}
                            className="w-full bg-brand-sidebar border border-brand-border rounded-lg p-3 text-white outline-none focus:border-brand-primary"
                          />
                          {showDropdown && searchTerm.length > 0 && (
                            <ul className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto bg-brand-panel border border-brand-primary rounded-lg shadow-xl shadow-black/50">
                              {products.filter(p => 
                                p.is_active && (
                                  p.codigo.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  p.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
                                )
                              ).map(p => (
                                <li 
                                  key={p.codigo} 
                                  className="p-3 text-sm text-white hover:bg-brand-primary cursor-pointer border-b border-brand-border/30 last:border-0"
                                  onClick={() => {
                                    setSearchTerm(`${p.codigo} - ${p.descripcion}`);
                                    handleProductSelect(p.codigo);
                                    setShowDropdown(false);
                                  }}
                                >
                                  <span className="font-bold text-brand-green mr-2">{p.codigo}</span>
                                  {p.descripcion}
                                </li>
                              ))}
                              {products.filter(p => p.is_active && (p.codigo.toLowerCase().includes(searchTerm.toLowerCase()) || p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))).length === 0 && (
                                <li className="p-3 text-sm text-brand-textMuted text-center italic">No hay coincidencias</li>
                              )}
                            </ul>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm text-brand-textMuted mb-1">Descripción Auto-Rellenado</label>
                          <input type="text" readOnly value={selectedProductStat?.descripcion||''} className="w-full bg-brand-panel border border-brand-border/50 text-gray-500 rounded-lg p-3 font-bold" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {subTabMov === 'salidas' && (
                            <div>
                              <label className="block text-sm text-brand-textMuted mb-1">Existencia Fís.</label>
                              <input type="text" readOnly value={selectedProductStat?`${selectedProductStat.existencias} U`:''} className="w-full bg-brand-panel border border-brand-border/50 text-white rounded-lg p-3 font-bold" />
                            </div>
                          )}
                          <div className={subTabMov==='entradas'?'col-span-2':''}>
                            <label className="block text-sm text-brand-textMuted mb-1">Costo Ponderado Actual</label>
                            <input type="text" readOnly value={selectedProductStat?formatBs(selectedProductStat.costoPromedio):''} className="w-full bg-brand-panel border border-brand-border/50 text-yellow-500 rounded-lg p-3 font-bold" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Tarjeta Acción */}
                    <div className="bg-brand-bg rounded-xl border border-brand-border p-6 shadow-sm relative pt-8">
                      <span className="absolute -top-3 left-4 bg-brand-bg px-2 text-brand-primary font-bold text-sm tracking-widest">PASO 2: VALORIZACIÓN</span>
                      
                      <div className="space-y-4">
                        {subTabMov === 'salidas' && (
                          <div>
                            <label className="block text-sm text-brand-textMuted mb-1">Destino de la Salida</label>
                            <select name="sub_type" required className="w-full bg-brand-sidebar border border-brand-border rounded-lg p-3 text-white outline-none focus:border-brand-primary">
                              <option value="salida">Venta Regular</option>
                              <option value="consumo">Consumo Interno</option>
                              <option value="perdida">Derma / Pérdida / Robo</option>
                            </select>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm text-brand-textMuted mb-1">Fecha</label>
                            <input type="date" name="date" required defaultValue={now.toISOString().split('T')[0]} className="w-full bg-brand-sidebar border border-brand-border text-white rounded-lg p-3 outline-none" style={{colorScheme: 'dark'}} />
                          </div>
                          <div>
                            <label className="block text-sm text-brand-textMuted mb-1">Cantidad (U.)</label>
                            <input type="number" name="quantity" min="1" defaultValue={1} max={subTabMov==='salidas'?selectedProductStat?.existencias||999:undefined} required className="w-full bg-brand-sidebar border border-brand-border text-white rounded-lg p-3 font-bold outline-none focus:border-brand-primary text-center text-lg" />
                          </div>
                        </div>

                        {subTabMov === 'entradas' && (
                          <div>
                            <label className="block text-sm text-brand-textMuted mb-1">Costo de Factura Entrante (Altera el Ponderado Real)</label>
                            <input type="number" step="0.01" name="costo_unitario" required defaultValue={selectedProductStat ? selectedProductStat.costoPromedio : ''} key={`costo-in-${selectedProductStat?.codigo}`} className="w-full bg-brand-sidebar border border-brand-border text-brand-green rounded-lg p-3 font-bold text-lg outline-none focus:border-brand-primary text-center" />
                          </div>
                        )}
                        <div>
                          <label className="block text-sm text-brand-textMuted mb-1">Información Extra (Factura/Destino)</label>
                          <input type="text" name={subTabMov==='entradas'?'factura':'destino'} required placeholder="Ej: Factura #000..." className="w-full bg-brand-sidebar border border-brand-border text-white rounded-lg p-3 outline-none focus:border-brand-primary" />
                        </div>

                        <button type="submit" className="w-full bg-brand-primary hover:bg-brand-primaryHover text-white font-bold py-3 px-4 rounded-lg transition-colors mt-4">
                          Registrar en Sistemas Centrales
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              )}

              {/* AUDITORIA */}
              <div className="bg-brand-panel rounded-xl p-6 border border-brand-border/30 mt-8">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                  <h3 className="text-white font-bold text-lg">Historial de Auditoría Global</h3>
                  
                  <div className="flex gap-4">
                    <div className="flex flex-col gap-1 text-sm text-brand-textMuted">
                      <span className="font-bold">Mes</span>
                      <select className="bg-brand-sidebar border border-brand-border text-white text-sm rounded focus:ring-brand-primary outline-none px-2 py-1" value={auditoriaMonth} onChange={e => setAuditoriaMonth(e.target.value)}>
                        {Array.from({length: 12}).map((_, i) => {
                          const m = String(i + 1).padStart(2, '0');
                          return <option key={m} value={m}>{m}</option>
                        })}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 text-sm text-brand-textMuted">
                      <span className="font-bold">Año</span>
                      <input type="number" className="bg-brand-sidebar w-20 border border-brand-border text-white text-sm rounded focus:ring-brand-primary outline-none px-2 py-1" value={auditoriaYear} onChange={e => setAuditoriaYear(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="bg-brand-tableBg border border-brand-border rounded-lg overflow-hidden">
                  <table className="w-full text-left text-sm text-brand-textMuted">
                    <thead className="bg-[#161B2A] border-b border-brand-border text-xs uppercase font-bold sticky top-0">
                      <tr>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Flujo</th>
                        <th className="px-4 py-3">Producto</th>
                        <th className="px-4 py-3">Factura</th>
                        <th className="px-4 py-3">Cant</th>
                        <th className="px-4 py-3">Costo BS.</th>
                        <th className="px-4 py-3">Total Asign. BS</th>
                        <th className="px-4 py-3 text-center">Auditoría</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border/50">
                      {recentTrans.map(t => (
                        <tr key={t.id} className="hover:bg-brand-sidebar/40">
                          <td className="px-4 py-3">{t.date}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${t.type==='entrada'?'bg-emerald-900/40 text-emerald-400':(t.type==='salida'?'bg-indigo-900/40 text-indigo-400':'bg-red-900/40 text-red-400')}`}>
                              {t.type.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 truncate max-w-[200px]" title={t.descripcion}>
                            <div className="text-white font-bold text-xs">{t.codigo}</div>
                            <div className="text-[10px] text-brand-textMuted">{t.descripcion}</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-brand-textMuted">{t.factura || '-'}</td>
                          <td className="px-4 py-3 text-white font-bold">{t.quantity} U</td>
                          <td className="px-4 py-3">{formatBs(t.costo_unitario)}</td>
                          <td className="px-4 py-3 font-bold text-white max-w-[150px] truncate">{formatBs(t.total_bolivares)}</td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={()=>handleDeleteTransaction(t.id)} className="text-brand-textMuted hover:text-brand-red transition text-xl px-2">🗑️</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================= TAB: PRODUCTOS ======================= */}
          {activeTab === 'productos' && (
            <div className="grid grid-cols-[1fr_2fr] gap-8">
              <div className="bg-brand-panel border border-brand-border/30 rounded-xl p-6 flex flex-col gap-6">
                
                <div className="flex bg-brand-bg rounded-lg p-1">
                  <button onClick={()=>{setSubTabProd('nuevo'); setEditSelectedStatus(null)}} className={`flex-1 py-2 text-sm font-bold rounded-md transition ${subTabProd==='nuevo'?'bg-brand-primary text-white':'text-brand-textMuted hover:text-white'}`}>Crear Base</button>
                  <button onClick={()=>setSubTabProd('modificar')} className={`flex-1 py-2 text-sm font-bold rounded-md transition ${subTabProd==='modificar'?'bg-brand-primary text-white':'text-brand-textMuted hover:text-white'}`}>Modificar</button>
                  <button onClick={()=>setSubTabProd('importar')} className={`flex-1 py-2 text-sm font-bold rounded-md transition ${subTabProd==='importar'?'bg-brand-green text-white shadow':'text-brand-textMuted hover:text-white'}`}>📥 Extracción de Excel</button>
                </div>

                {subTabProd === 'importar' && (
                  <div className="flex flex-col gap-4 text-center items-center justify-center p-8 border-2 border-dashed border-brand-border hover:border-brand-green transition-colors rounded-xl bg-brand-bg/50">
                    <span className="text-5xl mb-2">📄🤖</span>
                    <h3 className="text-white font-bold text-xl">Escáner Automatizado de Catálogos</h3>
                    <p className="text-brand-textMuted text-sm">Carga cientos de Renglones en fracciones de segundo.<br/><br/>Regla de Oro: Tu Fila #1 (Títulos) debe coincidir perfectamente con:<br/></p>
                    <div className="flex gap-2">
                      <strong className="text-white bg-brand-sidebar px-3 py-1 rounded shadow text-xs uppercase font-mono border-b-2 border-brand-green">codigo</strong>
                      <strong className="text-white bg-brand-sidebar px-3 py-1 rounded shadow text-xs uppercase font-mono border-b-2 border-brand-green">marca</strong>
                      <strong className="text-white bg-brand-sidebar px-3 py-1 rounded shadow text-xs uppercase font-mono border-b-2 border-brand-green">descripcion</strong>
                    </div>
                    
                    <label className="cursor-pointer bg-brand-green hover:bg-green-600 text-white font-bold py-4 px-6 rounded-lg mt-6 w-full transition-all shadow-md inline-flex items-center justify-center gap-2">
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                       Buscar y Escanear (Examinar archivo XSLX)
                       <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelImport} />
                    </label>
                  </div>
                )}

                {subTabProd === 'nuevo' && (
                  <form onSubmit={handleAddProduct} className="flex flex-col gap-4">
                    <div>
                      <label className="text-sm text-brand-textMuted">Marca Comercial</label>
                      <input name="marca" required className="w-full mt-1 bg-brand-sidebar border border-brand-border p-3 rounded-lg text-white" />
                    </div>
                    <div>
                      <label className="text-sm text-brand-textMuted">Código Interno</label>
                      <input name="codigo" required className="w-full mt-1 bg-brand-sidebar border border-brand-border p-3 rounded-lg text-white" />
                    </div>
                    <div>
                      <label className="text-sm text-brand-textMuted">Descripción Fiscal</label>
                      <textarea name="descripcion" required rows={3} className="w-full mt-1 bg-brand-sidebar border border-brand-border p-3 rounded-lg text-white"></textarea>
                    </div>
                    <button type="submit" className="w-full bg-brand-green hover:bg-green-600 text-white font-bold py-3 rounded-lg mt-2">Registrar en Catálogo</button>
                  </form>
                )}

                {subTabProd === 'modificar' && (
                  <form onSubmit={handleEditProduct} className="flex flex-col gap-4">
                    <div>
                      <label className="text-sm text-brand-textMuted">Encontrar Producto</label>
                      <select name="id" required onChange={(e)=>{
                         const sel = products.find(p=>p.id === parseInt(e.target.value));
                         setEditSelectedStatus(sel);
                         if(sel) {
                           const form = e.target.parentElement?.parentElement as HTMLFormElement;
                           (form.elements.namedItem('marca') as HTMLInputElement).value = sel.marca;
                           (form.elements.namedItem('codigo') as HTMLInputElement).value = sel.codigo;
                           (form.elements.namedItem('descripcion') as HTMLInputElement).value = sel.descripcion;
                         }
                      }} className="w-full mt-1 bg-brand-sidebar border border-brand-border p-3 rounded-lg text-white">
                        <option value="">Seleccione...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.codigo} {p.is_active?'':'(OCULTO)'}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-brand-textMuted">Modificar Marca</label>
                      <input name="marca" required className="w-full mt-1 bg-brand-sidebar border border-brand-border p-3 rounded-lg text-white" />
                    </div>
                    <div>
                      <label className="text-sm text-brand-textMuted">Modificar Código</label>
                      <input name="codigo" required className="w-full mt-1 bg-brand-sidebar border border-brand-border p-3 rounded-lg text-white" />
                    </div>
                    <div>
                      <label className="text-sm text-brand-textMuted">Modificar Desc.</label>
                      <input name="descripcion" required className="w-full mt-1 bg-brand-sidebar border border-brand-border p-3 rounded-lg text-white" />
                    </div>
                    <button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 rounded-lg mt-2">Actualizar Textos</button>
                    
                    {editSelectedStatus && (
                      <button type="button" 
                        onClick={async () => {
                          if(confirm("¿Forzar el cambio de visibilidad?")) {
                            const res = await fetch('/api/products', { method: 'PATCH', body: JSON.stringify({ id: editSelectedStatus.id, is_active: !editSelectedStatus.is_active ? 1 : 0 }) });
                            if(res.ok) { fetchProducts(); setEditSelectedStatus({...editSelectedStatus, is_active: !editSelectedStatus.is_active}); }
                          }
                        }}
                        className={`w-full font-bold py-3 rounded-lg border-2 ${editSelectedStatus.is_active ? 'border-brand-red text-brand-red hover:bg-brand-red hover:text-white' : 'border-brand-green text-brand-green hover:bg-brand-green hover:text-white'}`}>
                        {editSelectedStatus.is_active ? '🚫 Ocultar Fila (Anular del Menú)' : '✅ Reactivar'}
                      </button>
                    )}
                  </form>
                )}

              </div>

              {/* TABLA LISTADO DE PRODUCTOS */}
              <div className="bg-brand-panel border border-brand-border/30 rounded-xl overflow-hidden flex flex-col h-[700px]">
                <div className="bg-brand-bg p-4 border-b border-brand-border">
                  <span className="font-bold text-lg text-white">Rastreador de Referencias (Total Activos/Inactivos)</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left text-sm text-brand-textMuted">
                    <thead className="bg-[#161B2A] border-b border-brand-border text-xs uppercase font-bold sticky top-0">
                      <tr>
                        <th className="px-4 py-3">Cód</th>
                        <th className="px-4 py-3">Marca</th>
                        <th className="px-4 py-3">Descripción Oficial</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border/50">
                      {products.map(p => (
                        <tr key={p.id} className={`hover:bg-brand-sidebar/40 ${p.is_active?'':'opacity-40 grayscale blur-[0.5px]'}`}>
                          <td className="px-4 py-3 text-white font-bold">{p.codigo} {p.is_active?'':' 🚫'}</td>
                          <td className="px-4 py-3">{p.marca}</td>
                          <td className="px-4 py-3">{p.descripcion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
