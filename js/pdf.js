// pdf.js — amig0-travel-company | OCTech Services
// PDF generation for quotes and invoices using jsPDF + autoTable
// Exposes: window.PDF.generateQuote(data, clientName, tourName)
//          window.PDF.generateInvoice(data, clientName, tourName)

(function () {
  'use strict';

  window.PDF = {
    generateQuote:   generateQuote,
    generateInvoice: generateInvoice
  };

  // ---------------------------------------------------------------------------
  // Quote PDF
  // ---------------------------------------------------------------------------
  function generateQuote(data, clientName, tourName) {
    var doc = newDoc();
    var pageW = doc.internal.pageSize.getWidth();
    var margin = 20;
    var contentW = pageW - margin * 2;

    var y = drawHeader(doc, 'QUOTE', null, pageW, margin);

    y = drawMeta(doc, y, margin, contentW, [
      { label: 'To',          value: clientName || '—' },
      { label: 'Tour',        value: tourName   || '—' },
      { label: 'Status',      value: capitalize(data.status || 'draft') },
      { label: 'Valid Until', value: data.validUntil ? formatDate(data.validUntil.toDate()) : '—' },
      { label: 'Date Issued', value: data.createdAt ? formatDate(data.createdAt.toDate()) : formatDate(new Date()) }
    ]);

    y = drawLineItems(doc, y, margin, contentW, data.items || []);
    y = drawTotals(doc, y, margin, contentW, data);
    if (data.notes && data.notes.trim()) y = drawNotes(doc, y, margin, contentW, data.notes);
    drawFooter(doc, pageW, margin);

    var filename = 'Quote_' + (clientName || 'Client').replace(/\s+/g, '_') + '_' + dateStamp() + '.pdf';
    doc.save(filename);
  }

  // ---------------------------------------------------------------------------
  // Invoice PDF
  // ---------------------------------------------------------------------------
  function generateInvoice(data, clientName, tourName) {
    var doc = newDoc();
    var pageW = doc.internal.pageSize.getWidth();
    var margin = 20;
    var contentW = pageW - margin * 2;

    var y = drawHeader(doc, 'INVOICE', data.invoiceNumber || '', pageW, margin);

    y = drawMeta(doc, y, margin, contentW, [
      { label: 'To',       value: clientName || '—' },
      { label: 'Tour',     value: tourName   || '—' },
      { label: 'Status',   value: capitalize(data.status || 'draft') },
      { label: 'Due Date', value: data.dueDate  ? formatDate(data.dueDate.toDate())  : '—' },
      { label: 'Issued',   value: data.createdAt ? formatDate(data.createdAt.toDate()) : formatDate(new Date()) }
    ]);

    y = drawLineItems(doc, y, margin, contentW, data.items || []);
    y = drawTotals(doc, y, margin, contentW, data);

    // Payment summary block (invoice only)
    if (data.amountPaid !== undefined || data.balance !== undefined) {
      y += 4;
      var paid    = data.amountPaid || 0;
      var balance = (data.total || 0) - paid;
      var currency = data.currency || 'USD';

      doc.setDrawColor(220, 220, 220);
      doc.setFillColor(248, 248, 248);
      doc.roundedRect(margin, y, contentW, 22, 2, 2, 'FD');

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 100, 100);
      doc.text('PAYMENT SUMMARY', margin + 6, y + 7);

      doc.setFontSize(9);
      doc.setTextColor(40, 40, 40);
      doc.text('Amount Paid:', margin + 6, y + 14);
      doc.text(formatCurrency(paid, currency), margin + 60, y + 14);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(balance > 0 ? 180 : 30, balance > 0 ? 30 : 120, 30);
      doc.text('Balance Due:', margin + 95, y + 14);
      doc.text(formatCurrency(balance, currency), margin + 145, y + 14);
      doc.setTextColor(40, 40, 40);

      y += 28;
    }

    if (data.notes && data.notes.trim()) y = drawNotes(doc, y, margin, contentW, data.notes);
    drawFooter(doc, pageW, margin);

    var filename = 'Invoice_' + (data.invoiceNumber || 'INV') + '_' + (clientName || 'Client').replace(/\s+/g, '_') + '.pdf';
    doc.save(filename);
  }

  // ---------------------------------------------------------------------------
  // Shared drawing helpers
  // ---------------------------------------------------------------------------
  function newDoc() {
    var jsPDF = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
    return new jsPDF({ unit: 'mm', format: 'a4' });
  }

  function drawHeader(doc, docType, docNumber, pageW, margin) {
    // Brand mark
    var pdfMark = (window.AppConfig && window.AppConfig.pdfBrandMark) || 'Amig0';
    var pdfSub  = (window.AppConfig && window.AppConfig.pdfBrandSub)  || 'Travel Company';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(27, 73, 101); // --color-primary-mid
    doc.text(pdfMark, margin, 22);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(pdfSub, margin, 28);

    // Document type (right-aligned)
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text(docType, pageW - margin, 22, { align: 'right' });

    if (docNumber) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(docNumber, pageW - margin, 29, { align: 'right' });
    }

    // Divider
    doc.setDrawColor(27, 73, 101);
    doc.setLineWidth(0.5);
    doc.line(margin, 33, pageW - margin, 33);

    return 40; // return y after header
  }

  function drawMeta(doc, y, margin, contentW, fields) {
    var halfW = contentW / 2;
    var left  = fields.slice(0, 3);
    var right = fields.slice(3);

    var startY = y;
    left.forEach(function (f, i) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(120, 120, 120);
      doc.text(f.label.toUpperCase(), margin, startY + i * 8);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      doc.text(String(f.value), margin, startY + i * 8 + 4);
    });

    right.forEach(function (f, i) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(120, 120, 120);
      doc.text(f.label.toUpperCase(), margin + halfW, startY + i * 8);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      doc.text(String(f.value), margin + halfW, startY + i * 8 + 4);
    });

    var rows = Math.max(left.length, right.length);
    return y + rows * 8 + 10;
  }

  function drawLineItems(doc, y, margin, contentW, items) {
    if (!items || items.length === 0) return y;

    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Description', 'Qty', 'Unit Price', 'Amount']],
      body: items.map(function (i) {
        return [
          i.description || '',
          String(i.quantity || 1),
          formatCurrency(i.unitPrice, null),
          formatCurrency(i.amount, null)
        ];
      }),
      headStyles: {
        fillColor: [27, 73, 101],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: [40, 40, 40]
      },
      alternateRowStyles: {
        fillColor: [247, 249, 251]
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 30, halign: 'right' }
      },
      styles: {
        lineColor: [220, 226, 232],
        lineWidth: 0.2
      },
      theme: 'grid'
    });

    return doc.lastAutoTable.finalY + 4;
  }

  function drawTotals(doc, y, margin, contentW, data) {
    var currency = data.currency || 'USD';
    var subtotal = data.subtotal || 0;
    var taxRate  = data.tax || 0;
    var taxAmt   = subtotal * (taxRate / 100);
    var total    = data.total || 0;

    var labelX = margin + contentW - 60;
    var valueX = margin + contentW;

    var lines = [
      { label: 'Subtotal',               value: formatCurrency(subtotal, currency), bold: false },
      { label: 'Tax (' + taxRate + '%)', value: formatCurrency(taxAmt,   currency), bold: false },
      { label: 'TOTAL',                  value: formatCurrency(total,     currency), bold: true  }
    ];

    // Secondary currency line
    if (data.exchangeRate) {
      var secLabel, secValue;
      if (currency === 'MXN') {
        secLabel = '≈ USD equivalent';
        secValue = formatCurrency(total / data.exchangeRate, 'USD');
      } else {
        secLabel = '≈ MXN equivalent';
        secValue = formatCurrency(total * data.exchangeRate, 'MXN');
      }
      lines.push({ label: secLabel, value: secValue, bold: false, muted: true });
    }

    lines.forEach(function (line) {
      doc.setFontSize(line.bold ? 10 : 8.5);
      doc.setFont('helvetica', line.bold ? 'bold' : 'normal');
      if (line.muted) {
        doc.setTextColor(140, 140, 140);
      } else {
        doc.setTextColor(line.bold ? 27 : 80, line.bold ? 73 : 80, line.bold ? 101 : 80);
      }
      doc.text(line.label, labelX, y, { align: 'left' });
      doc.text(line.value, valueX, y, { align: 'right' });

      if (line.bold) {
        doc.setDrawColor(27, 73, 101);
        doc.setLineWidth(0.3);
        doc.line(labelX, y + 1.5, valueX, y + 1.5);
      }

      y += line.bold ? 8 : 6;
    });

    return y + 4;
  }

  function drawNotes(doc, y, margin, contentW, notes) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text('NOTES', margin, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(8.5);

    var lines = doc.splitTextToSize(notes, contentW);
    doc.text(lines, margin, y);

    return y + lines.length * 5 + 6;
  }

  function drawFooter(doc, pageW, margin) {
    var pageH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 18, pageW - margin, pageH - 18);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    var footerBrand = (window.AppConfig && window.AppConfig.brandName) || 'Amig0 Travel';
    var footerUrl   = (window.AppConfig && window.AppConfig.siteUrl)   || 'amig0travel.com';
    doc.text('Generated by ' + footerBrand + ' · ' + formatDate(new Date()), margin, pageH - 12);
    doc.text(footerUrl, pageW - margin, pageH - 12, { align: 'right' });
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function dateStamp() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function formatCurrency(amount, currency) {
    if (amount === undefined || amount === null) return '—';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 2
      }).format(amount);
    } catch (e) {
      return (currency || '') + ' ' + Number(amount).toFixed(2);
    }
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

})();
