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

      for (const t of txs || []) {
        const qty = Number(t.quantity);
        if (t.type === 'entrada') {
           const costoU = t.costo_unitario !== undefined && t.costo_unitario !== null ? Number(t.costo_unitario) : (Number(t.total_bolivares)/qty);
           // Fórmula Literal de Bodeguero: (Anterior + Nuevo) / 2
           if (costoPromedio === 0) {
              costoPromedio = costoU;
           } else {
              costoPromedio = (costoPromedio + costoU) / 2;
           }
           stock += qty;
        } else {
           stock -= qty;
           if (stock < 0) stock = 0;
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
