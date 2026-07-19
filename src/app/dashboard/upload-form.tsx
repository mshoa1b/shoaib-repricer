"use client";

import { useState } from "react";
import { uploadIngestionFile } from "./actions";
import * as xlsx from "xlsx";

export function UploadForm() {
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await uploadIngestionFile(formData);
      e.target.value = ''; // reset
    } catch (error) {
      console.error("Upload failed", error);
      alert("Failed to upload file");
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    const sampleData = [
      {
        "WIO Number": "WIO-10001",
        "WIO Name": "Box A",
        "Product Name": "Apple iPhone 15 256GB",
        "SKU": "APB-15-256-B",
        "Quantity": 10,
        "Purchase": 450.00
      }
    ];

    const ws = xlsx.utils.json_to_sheet(sampleData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Template");
    xlsx.writeFile(wb, "CP1_Ingestion_Template.xlsx");
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <label className="btn btn-primary" style={{ cursor: isUploading ? 'wait' : 'pointer', padding: '0.75rem 1.5rem', margin: 0 }}>
        {isUploading ? "Uploading..." : "Upload CP-1 Ingestion File (Excel)"}
        <input 
          type="file" 
          accept=".xlsx, .xls, .csv" 
          style={{ display: "none" }}
          onChange={handleUpload}
          disabled={isUploading}
        />
      </label>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={downloadTemplate}
        style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', whiteSpace: 'nowrap', margin: 0 }}
        title="Download Excel Ingestion Template"
      >
        📄 Download Template
      </button>
    </div>
  );
}
