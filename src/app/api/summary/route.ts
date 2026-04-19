import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month'); // MM //
  const year = searchParams.get('year'); // YYYY

  if (!month || !year) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
  }

  const currentDateTarget = `${year}-${month}`; 
  const targetDatePrefix = `${year}-${month}-`;

  try {
    const supabase = await createClient();
    const { data: allTransactions, error: txErr } = await supabase.from('transactions').select('*');
    const { data: products, error: prodErr } = await supabase.from('products').select('*');

    if (txErr || prodErr) throw new Error("Error Obteniendo Supabase");

    const summary = [];

    for (const p of products || []) {
      const pTrans = (allTransactions || []).filter((t: any) => t.product_id === p.id);

      const prevTrans = pTrans.filter((t: any) => t.date.substring(0, 7) < currentDateTarget);
      const currTrans = pTrans.filter((t: any) => t.date.startsWith(targetDatePrefix));

      const allPastTrans = pTrans.filter((t: any) => t.date.substring(0, 7) <= currentDateTarget)
                                 .sort((a: any, b: any) => a.date.localeCompare(b.date) || a.id - b.id);
      
      let costoPromedioConstante = 0;

      for(const t of allPastTrans) {
        if (t.type === 'entrada') {
           const qty = Number(t.quantity);
           const costoU = t.costo_unitario !== undefined && t.costo_unitario !== null ? Number(t.costo_unitario) : (Number(t.total_bolivares)/qty);
           // Fórmula Literal de Bodeguero: (Anterior + Nuevo) / 2
           if (costoPromedioConstante === 0) {
              costoPromedioConstante = costoU;
           } else {
              costoPromedioConstante = (costoPromedioConstante + costoU) / 2;
           }
        }
      }

      let initialStock = 0;
      for (const t of prevTrans) {
        const qty = Number(t.quantity);
        if (t.type === 'entrada') initialStock += qty;
        else initialStock -= qty;
      }
      const initialTotalBs = initialStock * costoPromedioConstante;

      let entries = 0, entriesBs = 0, sales = 0, salesBs = 0, loses = 0, losesBs = 0, consumes = 0, consumesBs = 0;

      for (const t of currTrans) {
        const qty = Number(t.quantity);
        const totalBs = Number(t.total_bolivares);
        if (t.type === 'entrada') { entries += qty; entriesBs += totalBs; }
        else if(t.type === 'salida') { sales += qty; salesBs += totalBs; }
        else if(t.type === 'perdida') { loses += qty; losesBs += totalBs; }
        else if(t.type === 'consumo') { consumes += qty; consumesBs += totalBs; }
      }

      const finalStock = initialStock + entries - sales - loses - consumes;
      const finalTotalBs = finalStock * costoPromedioConstante;

      if (!p.is_active && initialStock === 0 && finalStock === 0 && currTrans.length === 0) continue;

      summary.push({
        product: p,
        costoPromedio: costoPromedioConstante,
        initialStock, initialTotalBs,
        entries, entriesBs,
        sales, salesBs,
        loses, losesBs,
        consumes, consumesBs,
        finalStock, finalTotalBs
      });
    }

    return NextResponse.json(summary);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
