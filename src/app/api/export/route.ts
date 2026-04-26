import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');
  const year = searchParams.get('year');

  if (!month || !year) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });

  try {
    const currentDateTarget = `${year}-${month}`;
    const targetDatePrefix = `${year}-${month}-`;

    const supabase = await createClient();
    const { data: allTransactions, error: txErr } = await supabase.from('transactions').select('*');
    const { data: products, error: prodErr } = await supabase.from('products').select('*');

    if (txErr || prodErr) throw new Error("Error Base de Datos. No se Exportó Excel");

    const dataRows = [];

    for (const p of products || []) {
      const pTrans = (allTransactions || []).filter((t: any) => t.product_id === p.id);
      
      const prevTrans = pTrans.filter((t: any) => t.date.substring(0, 7) < currentDateTarget);
      const currTrans = pTrans.filter((t: any) => t.date.startsWith(targetDatePrefix));

      const allPastTrans = pTrans.filter((t: any) => t.date.substring(0, 7) <= currentDateTarget)
                                 .sort((a: any,b: any) => a.date.localeCompare(b.date) || a.id - b.id);
      
      let _stockAcum = 0;
      let costoPromedio = 0;

      for(const t of allPastTrans) {
        const qty = Number(t.quantity);
        if (t.type === 'entrada') {
           const costoU = t.costo_unitario !== undefined && t.costo_unitario !== null ? Number(t.costo_unitario) : (Number(t.total_bolivares)/qty);
           if (costoPromedio === 0) {
              costoPromedio = costoU;
           } else {
              costoPromedio = (costoPromedio + costoU) / 2;
           }
           _stockAcum += qty;
        } else {
           _stockAcum -= qty;
           if (_stockAcum < 0) _stockAcum = 0;
        }
      }

      let initialStock = 0;
      for (const t of prevTrans) { const qty = Number(t.quantity); if (t.type === 'entrada') initialStock += qty; else initialStock -= qty; }
      const initialTotalBs = initialStock * costoPromedio;

      let entries = 0, entriesBs = 0, sales = 0, salesBs = 0, loses = 0, losesBs = 0, consumes = 0, consumesBs = 0;

      for (const t of currTrans) {
        const qty = Number(t.quantity);
        const totalBs = Number(t.total_bolivares);
        if (t.type === 'entrada') { entries += qty; entriesBs += totalBs; }
        else if (t.type === 'salida') { sales += qty; salesBs += totalBs; }
        else if (t.type === 'perdida') { loses += qty; losesBs += totalBs; }
        else if (t.type === 'consumo') { consumes += qty; consumesBs += totalBs; }
      }

      const finalStock = initialStock + entries - sales - loses - consumes;
      const finalTotalBs = finalStock * costoPromedio;

      if (!p.is_active && initialStock === 0 && finalStock === 0 && currTrans.length === 0) continue;

      if (initialStock > 0 || entries > 0 || sales > 0 || loses > 0 || consumes > 0) {
        dataRows.push({
          codigo: p.codigo, descripcion: p.descripcion, cp: costoPromedio,
          iniUnid: initialStock, iniBs: initialTotalBs,
          entUnid: entries, entBs: entriesBs,
          salUnid: sales, salBs: salesBs,
          retUnid: loses, retBs: losesBs,
          conUnid: consumes, conBs: consumesBs,
          finUnid: finalStock, finBs: finalTotalBs
        });
      }
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Libro Nube');

    worksheet.getColumn(1).width = 15; worksheet.getColumn(2).width = 40; 
    for(let i = 3; i <= 21; i++) worksheet.getColumn(i).width = 15;

    const borderAll: Partial<ExcelJS.Borders> = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    const boldHeaderStyle: Partial<ExcelJS.Style> = { font: { bold: true }, alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }, border: borderAll };
    
    const applyStyleToMerge = (rangeStr: string, text: string, align: 'left'|'center'|'right' = 'center', weight: 'bold'|'normal' = 'bold') => {
      worksheet.mergeCells(rangeStr); const cell = worksheet.getCell(rangeStr.split(':')[0]);
      cell.value = text; cell.font = { bold: weight === 'bold' }; cell.alignment = { vertical: 'middle', horizontal: align, wrapText: true };
    };

    applyStyleToMerge('A2:A2', 'EMPRESA', 'left'); applyStyleToMerge('B2:U2', 'INVERSIONES & SUMINISTROS LOYAFU, C. A. (V4.Nube)', 'center');
    applyStyleToMerge('A3:A3', 'RIF', 'left'); applyStyleToMerge('B3:U3', 'J-503131551', 'center');
    applyStyleToMerge('A4:A4', 'DIR.', 'left'); applyStyleToMerge('B4:U4', 'AV. 102 MONTES DE OCA, CENTRO COMERCIAL GRAN BAZAR CENTRO...', 'center');
    applyStyleToMerge('A5:A5', 'FECHA', 'left'); applyStyleToMerge('B5:U5', `DEL 01/${month}/${year} AL 31/${month}/${year}`, 'center');
    applyStyleToMerge('A6:A6', 'BASE', 'left'); applyStyleToMerge('B6:U6', 'SEGÚN ARTICULO 177 DECRETO 2.504 ISLR', 'center');

    for(let r=2; r<=6; r++) { worksheet.getCell(`A${r}`).border = borderAll; for(let c=2; c<=21; c++) worksheet.getCell(r, c).border = {top: {style:'thin'}, bottom: {style:'thin'}}; worksheet.getCell(r, 2).border = {top: {style:'thin'}, bottom: {style:'thin'}, left: {style: 'thin'}}; worksheet.getCell(r, 21).border = {top: {style:'thin'}, bottom: {style:'thin'}, right: {style: 'thin'}}; }
    
    worksheet.mergeCells('A8:U8'); const titleCell = worksheet.getCell('A8'); titleCell.value = 'LIBRO DE ENTRADAS Y SALIDAS (VERCEL)'; titleCell.font = { bold: true }; titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    for(let c=1; c<=21; c++) worksheet.getCell(8, c).border = { top: {style: 'medium'}, bottom: {style: 'medium'} }; worksheet.getCell('A8').border = { top: {style: 'medium'}, bottom: {style: 'medium'}, left: {style:'medium'} }; worksheet.getCell(8, 21).border = { top: {style: 'medium'}, bottom: {style: 'medium'}, right: {style:'medium'} };

    const drawHeader = (sCol: number, fCol: number, title: string, arrRow11: string[]) => {
      if (sCol === fCol) { worksheet.mergeCells(10, sCol, 11, sCol); const cell = worksheet.getCell(10, sCol); cell.value = title; cell.style = boldHeaderStyle as any; worksheet.getCell(11, sCol).style = boldHeaderStyle as any; 
      } else { worksheet.mergeCells(10, sCol, 10, fCol); const cellTop = worksheet.getCell(10, sCol); cellTop.value = title; cellTop.style = boldHeaderStyle as any; for(let c=sCol; c<=fCol; c++) worksheet.getCell(10, c).border = borderAll;
        for(let i=0; i<arrRow11.length; i++) { const cellBot = worksheet.getCell(11, sCol + i); cellBot.value = arrRow11[i]; cellBot.style = boldHeaderStyle as any; }
      }
    };

    drawHeader(1, 1, 'CODIGO', []); drawHeader(2, 2, 'DESCRIPCION', []); drawHeader(3, 5, 'INV. INICIAL', ['COSTO', 'UNID', 'BOLIVARES']);
    drawHeader(6, 6, 'COSTO PROMEDIO', []); drawHeader(7, 9, 'ENTRADAS', ['COSTO', 'UNID', 'BOLIVARES']); drawHeader(10, 12, 'SALIDAS (VENTAS)', ['COSTO', 'UNID', 'BOLIVARES']);
    drawHeader(13, 15, 'RETIRO', ['COSTO', 'UNID', 'BOLIVARES']); drawHeader(16, 18, 'CONSU.', ['COSTO', 'UNID', 'BOLIVARES']); drawHeader(19, 21, 'INVENTARIO FINAL', ['COSTO', 'UNID', 'BOLIVARES']);

    let rowNum = 12;
    for (const d of dataRows) {
      const getC = (unid: number, bs: number, costo: number) => unid > 0 ? [costo, unid, bs] : ['', '', '']; 
      const excelRow = worksheet.getRow(rowNum);
      excelRow.values = [d.codigo, d.descripcion, d.cp, d.iniUnid, d.iniBs, d.cp, ...getC(d.entUnid, d.entBs, d.cp), ...getC(d.salUnid, d.salBs, d.cp), ...getC(d.retUnid, d.retBs, d.cp), ...getC(d.conUnid, d.conBs, d.cp), d.cp, d.finUnid, d.finBs]; 

      for(let c=1; c<=21; c++) {
        const cell = excelRow.getCell(c); cell.border = borderAll;
        if (c === 1 || c === 2) cell.alignment = { vertical: 'middle', horizontal: 'left' };
        else if (c===3||c===5||c===6||c===7||c===9||c===10||c===12||c===13||c===15||c===16||c===18||c===19||c===21) { cell.alignment = { vertical: 'middle', horizontal: 'right' }; cell.numFmt = '[$Bs. ]#,##0.00'; } 
        else { cell.alignment = { vertical: 'middle', horizontal: 'center' }; }
      } rowNum++;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, { headers: { 'Content-Disposition': `attachment; filename="Libro_V4_${month}_${year}.xlsx"`, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
  } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}
