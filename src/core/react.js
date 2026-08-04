// React kommt als globales UMD-Bundle aus index.html — hier nur die Hooks,
// damit die Module sie normal importieren können.
const { useState, useMemo, useCallback, useEffect, useRef } = React;

export { useState, useMemo, useCallback, useEffect, useRef };
