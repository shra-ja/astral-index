//! Strict scripted SQLite API double: checks SQL, bindings, ordering and transaction cleanup.
//! No SQLite connection is created by this module.
use rusqlite::{
    Error, Result, TransactionBehavior,
    types::{FromSql, ToSql, ToSqlOutput, Value, ValueRef},
};
use std::{cell::RefCell, collections::VecDeque, ops::Deref, path::Path};

pub enum Reply {
    Done,
    Count(usize),
    Id(i64),
    Rows(Vec<Result<Vec<Value>>>),
}
pub struct Step {
    pub sql: String,
    pub bindings: Vec<Value>,
    pub reply: Result<Reply>,
}
thread_local! { static SCRIPT: RefCell<VecDeque<Step>> = RefCell::default(); }
pub fn expect(steps: Vec<Step>) {
    SCRIPT.with(|script| {
        assert!(script.borrow().is_empty(), "unfinished mock script");
        *script.borrow_mut() = steps.into();
    });
}
pub fn finish() {
    SCRIPT.with(|script| assert!(script.borrow().is_empty(), "unconsumed SQL expectations"));
}
fn call(sql: &str, bindings: Vec<Value>) -> Result<Reply> {
    SCRIPT.with(|script| {
        let step = script
            .borrow_mut()
            .pop_front()
            .expect("unexpected database call");
        assert_eq!(sql, step.sql, "SQL operation");
        assert_eq!(bindings, step.bindings, "SQL bindings for {sql}");
        step.reply
    })
}
pub trait Bind {
    fn values(self) -> Vec<Value>;
}
impl Bind for [(); 0] {
    fn values(self) -> Vec<Value> {
        vec![]
    }
}
impl Bind for &[&dyn ToSql] {
    fn values(self) -> Vec<Value> {
        self.iter()
            .map(|value| match value.to_sql().unwrap() {
                ToSqlOutput::Borrowed(value) => Value::column_result(value).unwrap(),
                ToSqlOutput::Owned(value) => value,
                _ => panic!("unsupported synthetic binding"),
            })
            .collect()
    }
}
pub struct Connection;
impl Connection {
    pub fn open(path: &Path) -> Result<Self> {
        call(
            "OPEN",
            vec![Value::Text(path.to_string_lossy().into_owned())],
        )?;
        Ok(Self)
    }
    pub fn execute_batch(&self, sql: &str) -> Result<()> {
        call(sql, vec![])?;
        Ok(())
    }
    pub fn execute(&self, sql: &str, params: impl Bind) -> Result<usize> {
        match call(sql, params.values())? {
            Reply::Count(count) => Ok(count),
            _ => panic!("expected affected row count"),
        }
    }
    pub fn query_row<T>(
        &self,
        sql: &str,
        params: impl Bind,
        map: impl FnOnce(&Row) -> Result<T>,
    ) -> Result<T> {
        query(sql, params.values(), map)
    }
    pub fn prepare(&self, sql: &str) -> Result<Statement> {
        call(&format!("PREPARE {sql}"), vec![])?;
        Ok(Statement(sql.into()))
    }
    pub fn last_insert_rowid(&self) -> i64 {
        match call("LAST INSERT ID", vec![]).unwrap() {
            Reply::Id(id) => id,
            _ => panic!("expected insert ID"),
        }
    }
    pub fn transaction(&mut self) -> Result<Transaction<'_>> {
        self.transaction_with_behavior(TransactionBehavior::Deferred)
    }
    pub fn transaction_with_behavior(
        &mut self,
        behavior: TransactionBehavior,
    ) -> Result<Transaction<'_>> {
        call(
            match behavior {
                TransactionBehavior::Deferred => "BEGIN Deferred",
                TransactionBehavior::Immediate => "BEGIN Immediate",
                _ => panic!("unsupported transaction behavior"),
            },
            vec![],
        )?;
        Ok(Transaction {
            connection: self,
            committed: false,
        })
    }
}
pub struct Transaction<'a> {
    connection: &'a Connection,
    committed: bool,
}
impl Deref for Transaction<'_> {
    type Target = Connection;
    fn deref(&self) -> &Self::Target {
        self.connection
    }
}
impl Transaction<'_> {
    pub fn commit(mut self) -> Result<()> {
        call("COMMIT", vec![])?;
        self.committed = true;
        Ok(())
    }
}
impl Drop for Transaction<'_> {
    fn drop(&mut self) {
        if !self.committed && !std::thread::panicking() {
            call("ROLLBACK", vec![]).unwrap();
        }
    }
}
pub struct Statement(String);
impl Statement {
    pub fn execute(&mut self, params: impl Bind) -> Result<usize> {
        Connection.execute(&self.0, params)
    }
    pub fn query_row<T>(
        &mut self,
        params: impl Bind,
        map: impl FnOnce(&Row) -> Result<T>,
    ) -> Result<T> {
        query(&self.0, params.values(), map)
    }
    pub fn query_map<T>(
        &mut self,
        params: impl Bind,
        mut map: impl FnMut(&Row) -> Result<T>,
    ) -> Result<std::vec::IntoIter<Result<T>>> {
        let Reply::Rows(rows) = call(&self.0, params.values())? else {
            panic!("expected rows")
        };
        Ok(rows
            .into_iter()
            .map(|row| row.and_then(|values| map(&Row(values))))
            .collect::<Vec<_>>()
            .into_iter())
    }
}
pub struct Row(Vec<Value>);
impl Row {
    pub fn get<I: TryInto<usize>, T: FromSql>(&self, index: I) -> Result<T> {
        let index = index.try_into().ok().expect("column index");
        T::column_result(ValueRef::from(&self.0[index])).map_err(|_| Error::InvalidQuery)
    }
}
fn query<T>(sql: &str, bindings: Vec<Value>, map: impl FnOnce(&Row) -> Result<T>) -> Result<T> {
    let Reply::Rows(mut rows) = call(sql, bindings)? else {
        panic!("expected rows")
    };
    if rows.is_empty() {
        return Err(Error::QueryReturnedNoRows);
    }
    map(&Row(rows.remove(0)?))
}
