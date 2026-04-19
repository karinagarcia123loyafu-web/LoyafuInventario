import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const codigo = searchParams.get('codigo');

    if (codigo) {
      // Buscar Producto
      const { data: prod, error: prodErr } = await supabase.from('products').select('*').eq('codigo', codigo).single();
      if (prodErr || !prod) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
      
      // CRITICO: MATEMATICA DE COSTO PROMEDIO GLOBAL MENSUAL (Opción B del Cliente)
      const { data: txs, error: txErr } = await supabase
        .from('transactions')
        .select('type, quantity, total_bolivares, date, costo_unitario')
        .eq('product_id', prod.id)
        .order('date', { ascending: true })
        .order('id', { ascending: true });
        
      if (txErr) throw new Error(txErr.message);

      let stock = 0;
      let costoPromedio = 0;

      // Agrupar transacciones por mes (Año-Mes)
      const transByMonth: {[key: string]: any[]} = {};
      for (const t of txs || []) {
        const m = t.date ? t.date.substring(0, 7) : '2000-01';
        if (!transByMonth[m]) transByMonth[m] = [];
        transByMonth[m].push(t);
      }
      
      const sortedMonths = Object.keys(transByMonth).sort();
      
      for(const monthKey of sortedMonths) {
        const monthTrans = transByMonth[monthKey];
        const entradasDelMes = monthTrans.filter((t: any) => t.type === 'entrada');
        
        // Calcular promedio del mes según Opción 1: Exclusivo de Facturas
        if (entradasDelMes.length > 0) {
          let sumCostosNuevos = 0;
          for(const e of entradasDelMes) {
             const qty = Number(e.quantity);
             const costoU = e.costo_unitario ? Number(e.costo_unitario) : (Number(e.total_bolivares)/qty);
             sumCostosNuevos += costoU;
          }
          // El 'Costo Inicial' no importa, el promedio mensual se define sólo por las compras del mes
          costoPromedio = sumCostosNuevos / entradasDelMes.length;
        }
        
        // Al final calcular stock sin acoplarlo al precio
        for (const t of monthTrans) {
           const qty = Number(t.quantity);
           if (t.type === 'entrada') {
             stock += qty;
           } else {
             stock -= qty;
             if (stock < 0) stock = 0;
           }
        }
      }
      
      return NextResponse.json({ 
        ...prod, 
        existencias: stock,
        costoPromedio 
      });
    }

    // Listado (Ordenamos los inactivos de ultimo)
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .order('is_active', { ascending: false })
      .order('id', { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json(products);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { marca, codigo, descripcion } = await request.json();
    
    const { data, error } = await supabase
      .from('products')
      .insert([{ marca, codigo, descripcion, is_active: 1 }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const { id, marca, codigo, descripcion } = await request.json();
    
    const { error } = await supabase
      .from('products')
      .update({ marca, codigo, descripcion })
      .eq('id', id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { id, is_active } = await request.json();
    
    const { error } = await supabase
      .from('products')
      .update({ is_active: is_active ? 1 : 0 })
      .eq('id', id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
