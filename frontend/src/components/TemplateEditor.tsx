interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function TemplateEditor({ value, onChange, placeholder }: Props) {
  const insertVariable = (variable: string) => {
    onChange(value + `{{${variable}}}`);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-500">Insert variable:</span>
        {['name', 'email', 'unsubscribeLink'].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => insertVariable(v)}
            className="px-2 py-1 text-xs bg-brand-50 text-brand-600 rounded-lg border border-brand-250 border-brand-200
                       hover:bg-brand-100/50 hover:text-brand-700 transition-all duration-200"
          >
            {`{{${v}}}`}
          </button>
        ))}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={15}
        className="input-field font-mono text-sm resize-y min-h-[350px] w-full"
      />
    </div>
  );
}
