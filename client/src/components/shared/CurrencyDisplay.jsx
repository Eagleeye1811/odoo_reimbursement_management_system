import React from 'react';

export const CurrencyDisplay = ({ amountInBase, baseCurrencyCode, originalAmount, originalCurrencyCode, exchangeRate }) => {
  const formatCurrency = (val, currency) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  const showOriginal = originalCurrencyCode && baseCurrencyCode && originalCurrencyCode !== baseCurrencyCode;

  return (
    <div className="flex flex-col">
      <span className="font-bold text-gray-900">{formatCurrency(amountInBase, baseCurrencyCode)}</span>
      {showOriginal && (
        <span className="text-xs text-gray-500 mt-0.5">
          ({formatCurrency(originalAmount, originalCurrencyCode)} original &middot; rate: {exchangeRate})
        </span>
      )}
    </div>
  );
};
