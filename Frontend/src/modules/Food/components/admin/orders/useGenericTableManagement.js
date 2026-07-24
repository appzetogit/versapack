import { useState, useMemo } from "react"
import { exportToExcel, exportToPDF } from "./ordersExportUtils"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export function useGenericTableManagement(data, title, searchFields = []) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isViewOrderOpen, setIsViewOrderOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [filters, setFilters] = useState({})
  const [visibleColumns, setVisibleColumns] = useState({})

  // Apply search
  const filteredData = useMemo(() => {
    let result = [...data]

    // Apply search query
    if (searchQuery.trim() && searchFields.length > 0) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(item => 
        searchFields.some(field => {
          const value = item[field]
          return value && value.toString().toLowerCase().includes(query)
        })
      )
    }

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "") {
        result = result.filter(item => {
          const itemValue = item[key]
          if (typeof value === 'string') {
            return itemValue === value || itemValue?.toString().toLowerCase() === value.toLowerCase()
          }
          return itemValue === value
        })
      }
    })

    return result
  }, [data, searchQuery, filters, searchFields])

  const count = filteredData.length

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).filter(value => value !== "" && value !== null && value !== undefined).length
  }, [filters])

  const handleApplyFilters = () => {
    setIsFilterOpen(false)
  }

  const handleResetFilters = () => {
    setFilters({})
  }

  const handleExport = async (format) => {
    const filename = title.toLowerCase().replace(/\s+/g, "_")
    switch (format) {
      case "excel":
        exportToExcel(filteredData, filename)
        break
      case "pdf":
        await exportToPDF(filteredData, filename)
        break
      default:
        break
    }
  }

  const handleViewOrder = (order) => {
    setSelectedOrder(order)
    setIsViewOrderOpen(true)
  }

  const handlePrintOrder = async (order) => {
    try {
      // Dynamic import of jsPDF and autoTable for instant PDF download
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      // Handle transformed order structure if present
      const sourceOrder = order.originalOrder || order
      const pricing = sourceOrder.pricing || {}
      
      const customerName = order.customerName || order.userName || sourceOrder.customerName || sourceOrder.userName || sourceOrder.userId?.name || 'N/A'
      const customerPhone = order.customerPhone || order.userNumber || sourceOrder.customerPhone || sourceOrder.userNumber || sourceOrder.userId?.phone || 'N/A'
      const restaurantName = order.restaurant || order.restaurantName || sourceOrder.restaurantName || sourceOrder.restaurantId?.restaurantName || 'N/A'
      const orderId = order.orderId || sourceOrder.orderId || sourceOrder._id || 'N/A'
      const items = sourceOrder.cart?.items || sourceOrder.items || []
      const totalAmount = Number(order.totalAmount || pricing.total || sourceOrder.totalAmount || 0) || 0
      const subtotalFromOrder = Number(
        pricing.subtotal ??
        sourceOrder.subtotal ??
        sourceOrder.itemsTotal ??
        sourceOrder.cart?.subtotal ??
        0
      ) || 0
      const deliveryFee = Number(
        pricing.deliveryFee ??
        sourceOrder.deliveryFee ??
        sourceOrder.deliveryCharge ??
        sourceOrder.shippingFee ??
        0
      ) || 0
      const taxAmount = Number(
        pricing.tax ??
        pricing.taxAmount ??
        sourceOrder.tax ??
        sourceOrder.taxAmount ??
        sourceOrder.gstAmount ??
        0
      ) || 0
      const discountAmount = Number(
        pricing.discount ??
        sourceOrder.discount ??
        sourceOrder.couponDiscount ??
        0
      ) || 0
      const subtotal = subtotalFromOrder > 0
        ? subtotalFromOrder
        : Math.max(0, totalAmount - deliveryFee - taxAmount + discountAmount)
      const paymentStatus = order.paymentStatus || sourceOrder.payment?.status || sourceOrder.paymentStatus || 'N/A'
      const orderStatus = order.status || order.orderStatus || sourceOrder.orderStatus || 'N/A'

      // Add title
      doc.setFontSize(18)
      doc.setTextColor(30, 30, 30)
      doc.text('Order Invoice', 105, 20, { align: 'center' })
      
      // Order ID
      doc.setFontSize(12)
      doc.setTextColor(100, 100, 100)
      doc.text(`Order ID: ${orderId}`, 105, 28, { align: 'center' })
      
      // Date
      doc.setFontSize(10)
      let displayDate = 'N/A'
      try {
        const rawDate = order.date || order.orderDate || sourceOrder.createdAt
        if (rawDate) {
          const d = new Date(rawDate)
          if (!isNaN(d.getTime())) {
            displayDate = d.toLocaleString()
          } else {
            displayDate = rawDate
          }
        }
      } catch (e) {
        displayDate = order.orderDate || 'N/A'
      }
      doc.text(`Date: ${displayDate}`, 105, 34, { align: 'center' })
      
      let startY = 45
      
      // Customer Information
      doc.setFontSize(12)
      doc.setTextColor(30, 30, 30)
      doc.text('Customer Information', 14, startY)
      startY += 8
      
      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.text(`Name: ${customerName}`, 14, startY)
      startY += 6
      doc.text(`Phone: ${customerPhone}`, 14, startY)
      startY += 12
      
      // Restaurant Information
      doc.setFontSize(12)
      doc.setTextColor(30, 30, 30)
      doc.text('Restaurant', 14, startY)
      startY += 8
      
      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.text(restaurantName, 14, startY)
      startY += 10
      
      // Order Items Table
      if (items.length > 0) {
        const tableData = items.map((item) => [
          item.quantity || 1,
          item.name || item.itemName || item.title || 'Unknown Item',
          `Rs. ${(item.price || item.unitPrice || 0).toFixed(2)}`,
          `Rs. ${((item.quantity || 1) * (item.price || item.unitPrice || 0)).toFixed(2)}`
        ])
        
        autoTable(doc, {
          startY: startY,
          head: [['Qty', 'Item Name', 'Price', 'Total']],
          body: tableData,
          theme: 'striped',
          headStyles: {
            fillColor: [59, 130, 246],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 10
          },
          bodyStyles: {
            fontSize: 9,
            textColor: [30, 30, 30]
          },
          alternateRowStyles: {
            fillColor: [245, 247, 250]
          },
          styles: {
            cellPadding: 4,
            lineColor: [200, 200, 200],
            lineWidth: 0.5
          },
          columnStyles: {
            0: { cellWidth: 20, halign: 'center' },
            1: { cellWidth: 80 },
            2: { cellWidth: 35, halign: 'right' },
            3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
          },
          margin: { left: 14, right: 14 }
        })
        
        startY = doc.lastAutoTable.finalY + 10
      } else {
        doc.setFontSize(10)
        doc.setTextColor(150, 150, 150)
        doc.text('No item details available for this order type.', 14, startY)
        startY += 10
      }
      
      // Amount breakdown table
      doc.setFontSize(12)
      doc.setTextColor(30, 30, 30)
      doc.setFont(undefined, 'bold')
      doc.text("Amount Breakdown", 14, startY)
      startY += 4

      autoTable(doc, {
        startY,
        head: [["Label", "Amount"]],
        body: [
          ["Subtotal", `Rs. ${subtotal.toFixed(2)}`],
          ["Delivery Fee", `Rs. ${deliveryFee.toFixed(2)}`],
          ["Tax", `Rs. ${taxAmount.toFixed(2)}`],
          ["Discount", `Rs. ${discountAmount.toFixed(2)}`],
          ["Grand Total", `Rs. ${totalAmount.toFixed(2)}`],
        ],
        theme: 'grid',
        headStyles: {
          fillColor: [59, 130, 246],
          textColor: 255,
          fontSize: 10,
          fontStyle: 'bold',
        },
        bodyStyles: {
          fontSize: 10,
          textColor: [30, 30, 30],
        },
        styles: {
          cellPadding: 3.5,
          lineColor: [200, 200, 200],
          lineWidth: 0.4,
        },
        columnStyles: {
          0: { cellWidth: 120, fontStyle: 'bold' },
          1: { cellWidth: 50, halign: 'right' },
        },
        margin: { left: 14, right: 14 },
        didParseCell: (hookData) => {
          if (hookData.row.index === 4) {
            hookData.cell.styles.fontStyle = 'bold'
            hookData.cell.styles.textColor = [15, 118, 110]
          }
        },
      })

      startY = doc.lastAutoTable.finalY + 8

      // Payment Status
      doc.setTextColor(100, 100, 100)
      doc.text(`Payment Status: ${paymentStatus === 'cod_pending' ? 'Cash on Delivery' : paymentStatus}`, 14, startY)
      startY += 6
      
      // Order Status
      doc.text(`Order Status: ${orderStatus}`, 14, startY)
      
      // Save the PDF instantly
      const filename = `Invoice_${orderId}_${new Date().toISOString().split("T")[0]}.pdf`
      doc.save(filename)
    } catch (error) {
      debugError("Error generating PDF invoice:", error)
      alert("Failed to download PDF invoice. Please try again.")
    }
  }

  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }))
  }

  const resetColumns = (defaultColumns) => {
    setVisibleColumns(defaultColumns || {})
  }

  return {
    searchQuery,
    setSearchQuery,
    isFilterOpen,
    setIsFilterOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isViewOrderOpen,
    setIsViewOrderOpen,
    selectedOrder,
    filters,
    setFilters,
    visibleColumns,
    filteredData,
    count,
    activeFiltersCount,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  }
}
