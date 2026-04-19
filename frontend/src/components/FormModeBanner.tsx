interface FormModeBannerProps {
  entityName: string;
  editingId: string | null;
}

function FormModeBanner({ entityName, editingId }: FormModeBannerProps) {
  return (
    <div className="form-header">
      <h3 className="form-title">{editingId ? `Edit ${entityName}` : `Create ${entityName}`}</h3>
      <p className="form-subtitle">
        {editingId
          ? `Editing ${editingId}. Submit will update this existing record.`
          : `Fill the fields and submit to create a new ${entityName.toLowerCase()} record.`}
      </p>
    </div>
  );
}

export default FormModeBanner;
