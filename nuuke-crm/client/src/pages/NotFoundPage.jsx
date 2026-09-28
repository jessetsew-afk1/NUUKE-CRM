import { Link } from 'react-router-dom';
import { Wordmark } from '../components/Logo.jsx';

export default function NotFoundPage() {
  return (
    <div className="empty" style={{ height: '100%' }}>
      <Wordmark height={26} />
      <h3>That page is not here</h3>
      <p>The link may be out of date, or the board may have been renamed.</p>
      <Link className="btn btn-sm" to="/">Back to my work</Link>
    </div>
  );
}
