import React, { useState, useEffect } from 'react';
import { generateReadingReportPDF } from '../utils/generatePDF';

const PDFReportModal = ({ 
  isOpen, 
  onClose, 
  childData,
  sessions,
  dateRange 
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Form state - pre-fill from child profile and family settings
  const [formData, setFormData] = useState({
    schoolName: '',
    teacherName: '',
    parentName: ''
  });
  
  useEffect(() => {
    if (isOpen && childData) {
      setFormData({
        schoolName: childData.schoolName || '',
        teacherName: childData.teacherName || '',
        parentName: childData.familySettings?.parentName || ''
      });
    }
  }, [isOpen, childData]);
  
  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };
  
  const handleGeneratePDF = async () => {
    // Validation
    if (!formData.schoolName.trim()) {
      setError('Please enter school name');
      return;
    }
    
    if (!formData.parentName.trim()) {
      setError('Please enter parent/guardian name');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      await generateReadingReportPDF(
        childData.name,
        formData.schoolName,
        formData.teacherName,
        formData.parentName,
        sessions,
        dateRange.start,
        dateRange.end
      );
      
      // Success - close modal
      onClose();
      
    } catch (err) {
      setError('Failed to generate report. Please try again.');
      console.error('PDF generation error:', err);
    } finally {
      setLoading(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">📄</span>
          <h2 className="text-xl font-bold text-gray-800">
            Generate Reading Report for {childData?.name}
          </h2>
        </div>
        
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-900 font-medium mb-2">
            This report will include:
          </p>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>✓ Professional PDF format</li>
            <li>✓ Summary statistics</li>
            <li>✓ Detailed reading log</li>
            <li>✓ Ready to submit to teachers</li>
          </ul>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
        
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              School Name *
            </label>
            <input
              type="text"
              name="schoolName"
              value={formData.schoolName}
              onChange={handleChange}
              placeholder="Lincoln Elementary School"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teacher Name *
            </label>
            <input
              type="text"
              name="teacherName"
              value={formData.teacherName}
              onChange={handleChange}
              placeholder="Ms. Johnson"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Parent/Guardian Name *
            </label>
            <input
              type="text"
              name="parentName"
              value={formData.parentName}
              onChange={handleChange}
              placeholder="Your full name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Used for verification signature on the report
            </p>
          </div>
        </div>
        
        <div className="bg-gray-50 rounded-lg p-3 mb-6">
          <p className="text-sm font-medium text-gray-700 mb-2">Report Preview:</p>
          <div className="text-sm text-gray-600 space-y-1">
            <p><strong>{sessions.length}</strong> reading sessions</p>
            <p><strong>{sessions.reduce((sum, s) => sum + (s.minutes || 0), 0)}</strong> minutes</p>
            <p><strong>{new Set(sessions.map(s => s.book?.title).filter(Boolean)).size}</strong> books</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          
          <button
            onClick={handleGeneratePDF}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin">⏳</span>
                Generating...
              </>
            ) : (
              <>
                <span>📄</span>
                Generate PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PDFReportModal;
