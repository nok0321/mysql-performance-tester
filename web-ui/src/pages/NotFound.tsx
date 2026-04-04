import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
      <h1>404</h1>
      <p>{t('notFound.message')}</p>
      <Link to="/" className="btn btn-primary" style={{ marginTop: '1rem' }}>
        {t('notFound.backHome')}
      </Link>
    </div>
  );
}
