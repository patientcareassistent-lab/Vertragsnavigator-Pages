import React from 'react'
import {createRoot} from 'react-dom/client'
import ContractOcrReview from '../src/components/ContractOcrReview.jsx'
import ContractOcrRuleReview from '../src/components/ContractOcrRuleReview.jsx'
import '../src/styles.css'
const upload={upload_id:'22222222-2222-4222-8222-222222222222',
  filename:'BARMER_TK_Rahmenvertrag_2026.pdf',summary:{ocr_text_storage_path:'derived-ocr/22222222-2222-4222-8222-222222222222.json'}}
createRoot(document.getElementById('root')).render(<><ContractOcrReview upload={upload}/><ContractOcrRuleReview upload={upload}/></>)
