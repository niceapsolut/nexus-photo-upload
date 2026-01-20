import { CheckCircle } from 'lucide-react';

export default function UploadSuccess() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Success!</h1>
        <p className="text-slate-600 text-lg mb-6">
          Your photo has been uploaded successfully and is awaiting approval.
        </p>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">
            You can close this page now. Thank you for your submission!
          </p>
        </div>
      </div>
    </div>
  );
}
