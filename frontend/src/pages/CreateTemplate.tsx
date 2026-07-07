import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Save, SendHorizontal, Loader2, Maximize2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import TemplateEditor from '../components/TemplateEditor';
import { templateApi } from '../api/template.api';

interface TemplateForm {
  name: string;
  subject: string;
  htmlBody: string;
  plainTextBody: string;
}

export default function CreateTemplate() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [htmlBody, setHtmlBody] = useState(isEdit ? '' : `<html>
<body>
  <p>Dear {{name}},</p>
  
  <p>Type your content here...</p>
  
  <p>
    Don't want to receive these emails anymore? 
    <a href="{{ unsubscribeLink }}">Click here to unsubscribe</a> safely.
  </p>
</body>
</html>`);
  const [plainTextBody, setPlainTextBody] = useState(isEdit ? '' : `Dear {{name}},

Type your content here...

Don't want to receive these emails anymore? Click here to unsubscribe safely: {{unsubscribeLink}}`);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const getPreviewHtml = (rawHtml: string) => {
    if (!rawHtml) return '';
    let preview = rawHtml;
    
    // Replace placeholders with mock preview values
    preview = preview.replace(/\{\{\s*name\s*\}\}/gi, 'John Doe');
    preview = preview.replace(/\{\{\s*email\s*\}\}/gi, 'john.doe@example.com');

    const hasUnsubscribeHtml = /unsubscribelink/i.test(preview) || /unsubscribe/i.test(preview);
    if (!hasUnsubscribeHtml) {
      const footerHtml = '<br/><br/><hr style="border:none;border-top:1px solid #eee;margin:20px 0;"/><p style="font-size:12px;color:#666;text-align:center;">Don\'t want to receive these emails anymore? <a href="#" style="color:#0066cc;text-decoration:underline;">Click here to unsubscribe</a> safely.</p>';
      if (preview.toLowerCase().includes('</body>')) {
        preview = preview.replace(/<\/body>/i, `${footerHtml}</body>`);
      } else {
        preview = preview + footerHtml;
      }
    }
    
    preview = preview.replace(/\{\{\s*unsubscribeLink\s*\}\}/gi, '#');
    return preview;
  };

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<TemplateForm>();

  useEffect(() => {
    if (id) {
      templateApi.getOne(id).then((res) => {
        const t = res.data;
        setValue('name', t.name);
        setValue('subject', t.subject);
        setHtmlBody(t.htmlBody);
        setPlainTextBody(t.plainTextBody);
      });
    }
  }, [id]);

  const onSubmit = async (data: TemplateForm) => {
    setSaving(true);
    try {
      const payload = { ...data, htmlBody, plainTextBody };
      if (isEdit && id) {
        await templateApi.update(id, payload);
        toast.success('Template updated!');
      } else {
        await templateApi.create(payload);
        toast.success('Template created!');
      }
      navigate('/templates');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!id || !testEmail) {
      toast.error('Save template first and enter a test email');
      return;
    }
    setTesting(true);
    try {
      await templateApi.sendTest(id, testEmail);
      toast.success('Test email sent!');
    } catch {
      toast.error('Failed to send test email');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 border-b border-gray-200 pb-5">
        <button onClick={() => navigate('/templates')} className="p-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-500 transition-colors shadow-sm">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="page-title">{isEdit ? 'Edit Template' : 'Create Template'}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column - Template Information */}
        <div className="space-y-6">
          <div className="glass-card p-6 space-y-5 bg-white border border-gray-200 shadow-sm">
            {/* Template Name */}
            <div>
              <label htmlFor="template-name" className="label-text">Template Name</label>
              <input
                id="template-name"
                className="input-field"
                placeholder="e.g. Monthly Newsletter"
                {...register('name', { required: 'Name is required' })}
              />
              {errors.name && <p className="text-red-600 text-xs mt-1">{errors.name.message}</p>}
            </div>

            {/* Subject */}
            <div>
              <label htmlFor="template-subject" className="label-text">Email Subject</label>
              <input
                id="template-subject"
                className="input-field"
                placeholder="e.g. Hello {{name}}, check out our latest update!"
                {...register('subject', { required: 'Subject is required' })}
              />
              {errors.subject && <p className="text-red-600 text-xs mt-1">{errors.subject.message}</p>}
            </div>

            {/* HTML Body */}
            <div>
              <label className="label-text">HTML Body</label>
              <TemplateEditor
                value={htmlBody}
                onChange={setHtmlBody}
                placeholder="<h1>Hello {{name}}</h1><p>Your email content here...</p><p><a href='{{unsubscribeLink}}'>Unsubscribe</a></p>"
              />
            </div>

            {/* Plain Text Body */}
            <div>
              <label className="label-text">Plain Text Body</label>
              <textarea
                value={plainTextBody}
                onChange={(e) => setPlainTextBody(e.target.value)}
                placeholder="Hello {{name}}, your email content here... Unsubscribe: {{unsubscribeLink}}"
                rows={5}
                className="input-field resize-y text-sm font-mono text-gray-700 bg-white"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEdit ? 'Update Template' : 'Save Template'}
            </button>
          </div>

          {/* Send Test (only for existing templates) */}
          {isEdit && (
            <div className="glass-card p-6 bg-white border border-gray-200 shadow-sm">
              <h3 className="section-title mb-4 border-b border-gray-100 pb-3">Send Test Email</h3>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label htmlFor="test-email" className="label-text">Test Email Address</label>
                  <input
                    id="test-email"
                    type="email"
                    className="input-field"
                    placeholder="test@example.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={testing || !testEmail}
                  className="btn-secondary flex items-center gap-2 whitespace-nowrap h-[45px]"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}
                  Send Test
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Live Preview */}
        <div className="sticky top-6 flex flex-col border border-gray-200 rounded-2xl bg-white shadow-sm overflow-hidden h-[calc(100vh-140px)] min-h-[500px]">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Live Preview</h3>
              <p className="text-[10px] text-gray-500 mt-0.5">Real-time template rendering</p>
            </div>
            <button
              type="button"
              onClick={() => setIsFullscreen(true)}
              className="p-1.5 px-3 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors text-gray-650 text-gray-500 flex items-center gap-1.5 text-xs font-semibold shadow-sm"
              title="Full Screen Preview"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Full Screen</span>
            </button>
          </div>
          <div className="flex-1 bg-gray-50 p-4 overflow-hidden">
            <iframe
              srcDoc={htmlBody || `<div style="color: #666; font-family: sans-serif; text-align: center; padding: 60px; font-size: 14px;">No HTML content. Type code on the left to preview...</div>`}
              title="HTML Email Preview"
              className="w-full h-full border border-gray-200 rounded-xl bg-white shadow-inner"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </form>

      {/* Full Screen Preview Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 md:p-8 animate-fade-in">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scale-in">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Full Screen Template Preview</h3>
                <p className="text-xs text-gray-500 mt-0.5">Rendered email layout</p>
              </div>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 bg-gray-100 p-4">
              <iframe
                srcDoc={getPreviewHtml(htmlBody) || `<div style="color: #666; font-family: sans-serif; text-align: center; padding: 40px; font-size: 14px;">No HTML content. Type code in the editor to preview...</div>`}
                title="Full Screen Email Preview"
                className="w-full h-full border border-gray-205 border-gray-200 bg-white rounded-lg shadow-sm"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
