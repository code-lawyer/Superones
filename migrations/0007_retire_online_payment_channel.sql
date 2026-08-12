-- Retire the former online payment integration while preserving the immutable
-- financial history of completed/refunded orders in provider-neutral form.
WITH rewritten AS (
  SELECT
    namespace,
    jsonb_set(
      replace(document::text, '"alipay"', '"retired_online"')::jsonb,
      '{version}',
      '10'::jsonb
    ) AS document
  FROM vault2077_state_documents
  WHERE namespace = 'opc-orders'
), sanitized AS (
  SELECT
    namespace,
    jsonb_set(
      document,
      '{orders}',
      COALESCE((
        SELECT jsonb_agg(
          CASE
            WHEN order_record #>> '{payment,provider}' = 'retired_online'
              THEN jsonb_set(
                order_record,
                '{payment}',
                (order_record -> 'payment') - 'appId' - 'sellerId' - 'channel'
              )
            ELSE order_record
          END
        )
        FROM jsonb_array_elements(document -> 'orders') AS order_record
      ), '[]'::jsonb)
    ) AS document
  FROM rewritten
)
UPDATE vault2077_state_documents AS target
SET document = sanitized.document,
    version = target.version + 1,
    updated_at = now()
FROM sanitized
WHERE target.namespace = sanitized.namespace;
