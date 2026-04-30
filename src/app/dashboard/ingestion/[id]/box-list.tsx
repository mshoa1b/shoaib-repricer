"use client";

import { useState } from "react";
import { updateBoxItems } from "../../actions";

interface Item {
  id?: string;
  productName: string;
  sku: string;
  quantity: number;
  cp1Price: number;
}

interface Box {
  id: string;
  wioNumber: string;
  wioName: string;
  items: Item[];
}

export function BoxList({ boxes }: { boxes: Box[] }) {
  const [editingBoxId, setEditingBoxId] = useState<string | null>(null);
  const [tempItems, setTempItems] = useState<Item[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = (box: Box) => {
    setEditingBoxId(box.id);
    setTempItems([...box.items]);
  };

  const cancelEditing = () => {
    setEditingBoxId(null);
    setTempItems([]);
  };

  const handleItemChange = (index: number, field: keyof Item, value: any) => {
    const updated = [...tempItems];
    updated[index] = { ...updated[index], [field]: value };
    setTempItems(updated);
  };

  const addItem = () => {
    setTempItems([...tempItems, { productName: "", sku: "", quantity: 1, cp1Price: 0 }]);
  };

  const removeItem = (index: number) => {
    setTempItems(tempItems.filter((_, i) => i !== index));
  };

  const saveChanges = async () => {
    if (!editingBoxId) return;
    setIsSaving(true);
    try {
      await updateBoxItems(editingBoxId, tempItems);
      setEditingBoxId(null);
      setTempItems([]);
    } catch (error) {
      console.error("Failed to save changes", error);
      alert("Failed to save changes. Check console for details.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {boxes.map((box) => {
        const isEditing = editingBoxId === box.id;
        const totalQty = box.items.reduce((sum, item) => sum + item.quantity, 0);
        const totalValue = box.items.reduce((sum, item) => sum + (item.quantity * item.cp1Price), 0);

        return (
          <div key={box.id} className="card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="text-secondary font-mono text-xs" style={{ marginRight: '1rem' }}>{box.wioNumber}</span>
                <span style={{ fontWeight: 600 }}>{box.wioName}</span>
                <span className="text-secondary text-xs" style={{ marginLeft: '1.5rem' }}>
                  {box.items.length} product lines · {totalQty} units · €{totalValue.toLocaleString()}
                </span>
              </div>
              {!isEditing && (
                <button 
                  onClick={() => startEditing(box)}
                  className="btn btn-secondary" 
                  style={{ padding: '0.4rem 1rem', fontSize: '0.75rem' }}
                >
                  Amend Content
                </button>
              )}
            </div>

            {isEditing && (
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem' }}>
                <div className="table-container" style={{ marginBottom: '1.5rem' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Product Name</th>
                        <th>SKU</th>
                        <th style={{ width: '100px' }}>Quantity</th>
                        <th style={{ width: '120px' }}>CP-1 Price</th>
                        <th style={{ width: '80px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {tempItems.map((item, idx) => (
                        <tr key={idx}>
                          <td>
                            <input 
                              type="text" 
                              className="table-input" 
                              value={item.productName} 
                              onChange={(e) => handleItemChange(idx, 'productName', e.target.value)}
                            />
                          </td>
                          <td>
                            <input 
                              type="text" 
                              className="table-input" 
                              value={item.sku} 
                              onChange={(e) => handleItemChange(idx, 'sku', e.target.value)}
                            />
                          </td>
                          <td>
                            <input 
                              type="number" 
                              className="table-input" 
                              value={item.quantity} 
                              onChange={(e) => handleItemChange(idx, 'quantity', parseInt(e.target.value) || 0)}
                            />
                          </td>
                          <td>
                            <div style={{ position: 'relative' }}>
                              <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}>€</span>
                              <input 
                                type="number" 
                                className="table-input" 
                                style={{ paddingLeft: '1.5rem' }}
                                value={item.cp1Price} 
                                onChange={(e) => handleItemChange(idx, 'cp1Price', parseFloat(e.target.value) || 0)}
                              />
                            </div>
                          </td>
                          <td className="text-center">
                            <button 
                              onClick={() => removeItem(idx)}
                              style={{ background: 'none', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', fontSize: '1.2rem' }}
                              title="Remove item"
                            >
                              &times;
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button 
                    onClick={addItem}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.4rem 1rem' }}
                  >
                    + Add Item
                  </button>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button 
                      onClick={cancelEditing}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.4rem 1rem' }}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={saveChanges}
                      className="btn btn-primary"
                      style={{ fontSize: '0.75rem', padding: '0.4rem 1rem' }}
                      disabled={isSaving}
                    >
                      {isSaving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
