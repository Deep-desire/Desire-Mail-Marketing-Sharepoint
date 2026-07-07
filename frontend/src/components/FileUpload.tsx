import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';

interface Props {
  onFileSelect: (file: File) => void;
  isUploading: boolean;
}

export default function FileUpload({ onFileSelect, isUploading }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): boolean => {
    setError(null);
    if (!file.name.endsWith('.xlsx')) {
      setError('Only .xlsx files are accepted');
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be under 10MB');
      return false;
    }
    return true;
  };

  const handleFile = (file: File) => {
    if (validateFile(file)) {
      setSelectedFile(file);
      onFileSelect(file);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div className="space-y-4">
      <label
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative flex flex-col items-center justify-center w-full h-52 
                     rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300
                     ${isDragging
                       ? 'border-brand-500 bg-brand-50/50 scale-[1.01]'
                       : 'border-gray-300 bg-white hover:border-brand-400 hover:bg-gray-50/50'
                     }
                     ${isUploading ? 'pointer-events-none opacity-60' : ''}
                   `}
      >
        <input
          type="file"
          accept=".xlsx"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          disabled={isUploading}
        />

        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Uploading & processing...</p>
          </div>
        ) : selectedFile ? (
          <div className="flex flex-col items-center gap-3">
            <FileSpreadsheet className="w-12 h-12 text-emerald-600 animate-bounce" />
            <p className="text-sm text-gray-900 font-semibold">{selectedFile.name}</p>
            <p className="text-xs text-gray-500">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="w-12 h-12 text-gray-400" />
            <div className="text-center">
              <p className="text-sm text-gray-600">
                <span className="text-brand-600 font-semibold">Click to upload</span>{' '}
                or drag and drop
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Only .xlsx files • Max 10MB
              </p>
            </div>
          </div>
        )}
      </label>

      {error && (
        <div className="flex items-center gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Required format info */}
      <div className="glass-card p-5 bg-white border border-gray-250 border-gray-200">
        <p className="text-sm font-semibold text-gray-700 mb-2">Required Excel Format:</p>
        <div className="overflow-x-auto">
          <table className="text-xs text-gray-600 w-full max-w-xs">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 px-4 text-left font-bold text-brand-600">name</th>
                <th className="py-2 px-4 text-left font-bold text-brand-600">email</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-1.5 px-4">John Doe</td>
                <td className="py-1.5 px-4 text-gray-500">john@example.com</td>
              </tr>
              <tr>
                <td className="py-1.5 px-4">Jane Smith</td>
                <td className="py-1.5 px-4 text-gray-500">jane@example.com</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
