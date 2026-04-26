"use client";

import { useState } from "react";
import { uploadIngestionFile } from "./actions";

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

  return (
    <div>
      <label className="btn btn-primary" style={{ cursor: isUploading ? 'wait' : 'pointer', padding: '0.75rem 1.5rem' }}>
        {isUploading ? "Uploading..." : "Upload CP-1 Ingestion File (Excel)"}
        <input 
          type="file" 
          accept=".xlsx, .xls, .csv" 
          style={{ display: "none" }}
          onChange={handleUpload}
          disabled={isUploading}
        />
      </label>
    </div>
  );
}
