// Small lexer for ADELE's existing SQL, not a general MySQL transpiler.
// Placeholders and rewrites never inspect string/comment contents as code.
export function tokenize(sql) {
  const tokens=[]
  for (let i=0;i<sql.length;) {
    const rest=sql.slice(i)
    let m
    if ((m=/^\s+/.exec(rest))) { i+=m[0].length; continue }
    if (rest.startsWith('--')) { const end=sql.indexOf('\n',i); i=end<0?sql.length:end+1; continue }
    if (rest.startsWith('/*')) { const end=sql.indexOf('*/',i+2); if(end<0)throw Error('Unterminated SQL comment'); i=end+2;continue }
    if (rest[0]==="'" || rest[0]==='"' || rest[0]==='`') {
      const quote=rest[0]; let raw=quote,closed=false; i++
      while(i<sql.length) {
        const ch=sql[i++]; raw+=ch
        if(ch==='\\') throw Error('Backslash SQL literals are unsupported; bind data instead.')
        if(ch===quote) { if(sql[i]===quote){raw+=sql[i++]}else{closed=true;break} }
      }
      if(!closed)throw Error('Unterminated SQL literal')
      tokens.push({raw,kind:quote==="'"?'string':'identifier'});continue
    }
    if(/^\$[a-zA-Z_]*\$/.test(rest))throw Error('Dollar-quoted application SQL is not supported')
    if((m=/^@[A-Za-z_]\w*/.exec(rest))){tokens.push({raw:m[0],kind:'named'});i+=m[0].length;continue}
    if((m=/^(?:[A-Za-z_]\w*|\d+(?:\.\d+)?|::|>=|<=|<>|!=|\|\|)/.exec(rest))){tokens.push({raw:m[0],kind:'code'});i+=m[0].length;continue}
    if(rest[0]===';')throw Error('Only a single application SQL statement is allowed')
    tokens.push({raw:rest[0],kind:rest[0]==='?'?'bind':'code'});i++
  }
  return tokens
}
export function compile(sql, params, { returning=false }={}) {
  const tokens=tokenize(sql), values=[]
  if (!['SELECT','INSERT','UPDATE','DELETE'].includes(tokens[0]?.raw.toUpperCase())) throw Error('Runtime SQL cannot execute DDL, migrations or multiple commands')
  let position=0
  const input=params ?? []
  const normalized=tokens.map(t=>t.kind==='identifier'?'"'+t.raw.slice(1,-1).replaceAll('"','""')+'"':t.raw)
  const output=[]
  for(let i=0;i<tokens.length;i++) {
    const t=tokens[i], upper=t.raw.toUpperCase()
    if(t.kind==='code' && upper==='DATE_FORMAT') {
      const fragment=normalized.slice(i,i+6).join(' ')
      // ADELE uses a simple date column here; qualified columns are handled below.
      let j=i+2; const column=[]
      while(j<tokens.length && tokens[j].raw!==',')column.push(normalized[j++])
      if(tokens[i+1]?.raw!=='(' || !/^[A-Za-z_][\w]*(?: \. [A-Za-z_][\w]*)?$/.test(column.join(' ')) || tokens[j+1]?.raw!=="'%Y-%m'" || tokens[j+2]?.raw!==')') throw Error('Unsupported DATE_FORMAT expression: '+fragment.slice(0,20))
      output.push(`to_char ( ${column.join(' ')} , 'YYYY-MM' )`);i=j+2;continue
    }
    if(t.kind==='bind' || t.kind==='named') {
      let value
      if(t.kind==='bind') { if(!Array.isArray(input)||position>=input.length)throw Error('Missing positional SQL argument');value=input[position++] }
      else { const name=t.raw.slice(1);if(Array.isArray(input)||!Object.hasOwn(input,name))throw Error('Missing named SQL argument');value=input[name] }
      if(value===undefined)throw Error('Undefined SQL argument')
      if(typeof value==='number' && !Number.isSafeInteger(value)) { const error=new Error('Fractional/unsafe numeric SQL parameters must be exact decimal strings');error.statusCode=400;throw error }
      values.push(value);output.push('$'+values.length);continue
    }
    if(t.kind==='code' && upper==='SUCCESSFUL' && tokens[i+1]?.raw==='=' && ['0','1'].includes(tokens[i+2]?.raw)) {
      output.push('successful = '+(tokens[i+2].raw==='1'?'true':'false'));i+=2;continue
    }
    if(t.kind==='code' && ['UNSIGNED','AUTO_INCREMENT','DATABASE'].includes(upper))throw Error('Unsupported MySQL SQL; use the explicit ADELE PostgreSQL adapter')
    output.push(normalized[i])
  }
  if(Array.isArray(input) && position!==input.length)throw Error('Unused positional SQL arguments')
  let text=output.join(' ')
  const upsert=text.match(/ ON DUPLICATE KEY UPDATE (.*)$/i)
  if(upsert) {
    if(!/^INSERT INTO settings \( "key" , value \) VALUES \( \$1 , \$2 \)/i.test(text))throw Error('Unsupported MySQL upsert')
    let clause
    if(/^value = VALUES \( value \)$/i.test(upsert[1]))clause='ON CONFLICT ("key") DO UPDATE SET value = EXCLUDED.value'
    else if(/^"key" = "key"$/i.test(upsert[1]))clause='ON CONFLICT ("key") DO NOTHING'
    else throw Error('Unsupported settings upsert')
    text=text.slice(0,upsert.index)+' '+clause
  }
  // PostgreSQL cannot infer an integer parameter as both a business reference and id.
  text=text.replace(/\bid = (\$\d+) OR application_id = (\$\d+)/g,'id::text = $1 OR application_id = $2')
  if(returning && /^INSERT INTO /i.test(text) && !/\bRETURNING\b/i.test(text))text+=' RETURNING id'
  return {text,values}
}
