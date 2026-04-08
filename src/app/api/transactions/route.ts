import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const year = searchParams.get('year');
    
    // Build query
    let query = supabase
      .from('transactions')
      .select(`
        *,
        products (
          marca, codigo, descripcion
        )
      `);
      
    if (month && year) {
      // Filtrar por prefijo de fecha YYYY-MM
      query = query.like('date', `${year}-${month}-%`);
    }

    const { data: transactions, error } = await query
      .order('date', { ascending: false })
      .order('id', { ascending: false });

    if (error) throw new Error(error.message);

    // Mapeamos para que la estructura devuelta sea identica a la que esperaba SQLite
    // En sqlite venia "t.*, p.marca, p.codigo..." plano.
    // Supabase devuelve objects anidados: t.*, products: { marca, codigo... }
    const flatTransactions = transactions?.map((t: any) => ({
      ...t,
      marca: t.products?.marca,
      codigo: t.products?.codigo,
      descripcion: t.products?.descripcion,
      // Borramos el objeto anidado para dejarlo tal cual estaba
      products: undefined 
    }));

    return NextResponse.json(flatTransactions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { product_id, type, quantity, date, costo_unitario, factura, destino } = await request.json();
    
    const qty = parseFloat(quantity) || 0;
    const cost = parseFloat(costo_unitario) || 0;
    const total_bolivares = qty * cost;

    const { data, error } = await supabase
      .from('transactions')
      .insert([{
        product_id, 
        type, 
        quantity: qty, 
        date, 
        costo_unitario: cost, 
        total_bolivares, 
        factura: factura || '', 
        destino: destino || ''
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    
    return NextResponse.json({ id: data.id, total_bolivares });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) return NextResponse.json({ error: 'ID requerido para borrar' }, { status: 400 });
    
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
