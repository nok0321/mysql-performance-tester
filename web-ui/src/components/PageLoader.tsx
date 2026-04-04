import { useTranslation } from 'react-i18next';

export default function PageLoader() {
  const { t } = useTranslation();
  return (
    <div className="page-loader">
      <div className="page-loader-spinner" />
      <p>{t('app.loading', 'Loading...')}</p>
    </div>
  );
}
