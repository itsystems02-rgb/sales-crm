'use client';

import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function Home() {
  return (
    <div className="page">
      <div className="card">
        <h2 className="card-title">Sales CRM</h2>
        <div className="form-row">
          <Input value="" onChange={() => {}} placeholder="اختبار input" />
          <Button>حفظ</Button>
        </div>
      </div>
    </div>
  );
}